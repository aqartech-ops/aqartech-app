import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ChequeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import type { UserAuth } from '../common/auth-context.js';
import { addDays, today } from '../common/dates.js';
import * as v from '../common/validate.js';
import { ChargesService } from './charges.service.js';
import { LedgerService } from './ledger.service.js';
import { PaymentsService } from './payments.service.js';
import { chargeLines, chequeClearedLines, nthChequeNumber } from './journal.js';

const WEEK = 7;
const MAX_INT = 2_147_483_647;

const INCLUDE = {
  tenant: { select: { id: true, name: true, phone: true } },
  lease: { select: { id: true, number: true, unit: { select: { number: true } }, property: { select: { name: true } } } },
  payment: { select: { id: true, number: true, status: true } },
} as const;

/**
 * Cheques (الشيكات).
 *  RECEIVED          kept (often post-dated) — no accounting yet, the tenant still owes
 *  UNDER_COLLECTION  deposited / accepted — receipt issued: Dr cheques under collection / Cr tenant receivable
 *  CLEARED           money in the bank: Dr bank / Cr cheques under collection
 *  BOUNCED           receipt voided by a reversing entry (the tenant owes again) + optional fee: Dr receivable / Cr other income
 *  CANCELLED         returned to the tenant before deposit — no accounting
 */
@Injectable()
export class ChequesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly ledger: LedgerService,
    private readonly charges: ChargesService,
    private readonly payments: PaymentsService,
  ) {}

  /** filter: toDeposit (kept and due within 7 days or overdue) | received | collecting | bounced | cleared | cancelled | all */
  async list(auth: UserAuth, query: { filter?: string; tenantId?: string; leaseId?: string }) {
    const where: Prisma.ChequeWhereInput = { companyId: auth.companyId, ...this.scope(auth) };
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.leaseId) where.leaseId = query.leaseId;
    const statusOf: Record<string, ChequeStatus> = {
      received: 'RECEIVED',
      collecting: 'UNDER_COLLECTION',
      bounced: 'BOUNCED',
      cleared: 'CLEARED',
      cancelled: 'CANCELLED',
    };
    if (query.filter === 'toDeposit') {
      where.status = 'RECEIVED';
      where.dueDate = { lte: addDays(today(), WEEK) };
    } else if (query.filter && statusOf[query.filter]) {
      where.status = statusOf[query.filter];
    }
    return this.prisma.cheque.findMany({ where, include: INCLUDE, orderBy: [{ dueDate: 'asc' }, { number: 'asc' }], take: 300 });
  }

  /** Counts and totals for the Financials page and the dashboard. */
  async stats(auth: UserAuth) {
    const base = { companyId: auth.companyId, ...this.scope(auth) };
    const [held, toDeposit, collecting, bounced] = await Promise.all([
      this.prisma.cheque.aggregate({ where: { ...base, status: 'RECEIVED' }, _sum: { amount: true }, _count: true }),
      this.prisma.cheque.aggregate({ where: { ...base, status: 'RECEIVED', dueDate: { lte: addDays(today(), WEEK) } }, _sum: { amount: true }, _count: true }),
      this.prisma.cheque.aggregate({ where: { ...base, status: 'UNDER_COLLECTION' }, _sum: { amount: true }, _count: true }),
      this.prisma.cheque.aggregate({ where: { ...base, status: 'BOUNCED', bouncedAt: { gte: addDays(today(), -90) } }, _sum: { amount: true }, _count: true }),
    ]);
    const pick = (a: { _sum: { amount: number | null }; _count: number }) => ({ total: a._sum.amount ?? 0, count: a._count });
    return { held: pick(held), toDeposit: pick(toDeposit), collecting: pick(collecting), bounced90: pick(bounced) };
  }

  async create(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const lease = await this.findLease(auth, v.requiredString(src, 'leaseId', 60));
    const data = this.fields(src, true);
    await this.assertNotDuplicate(auth.companyId, data.bankName!, data.number!);
    const cheque = await this.prisma.cheque.create({
      data: {
        companyId: auth.companyId,
        tenantId: lease.tenantId,
        leaseId: lease.id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        chargeId: v.optionalString(src, 'chargeId', 60) ?? null,
        number: data.number!,
        bankName: data.bankName!,
        drawer: data.drawer ?? null,
        amount: data.amount!,
        dueDate: data.dueDate!,
        notes: data.notes ?? null,
        createdById: auth.userId,
      },
      include: INCLUDE,
    });
    await this.activity.log(auth, { action: 'cheque.create', entity: 'Cheque', entityId: cheque.id, details: { number: cheque.number, amount: cheque.amount } });
    return cheque;
  }

  /** What a lease still needs cheques for: its open installments (posted unpaid or not due yet) without an active cheque. */
  async plan(auth: UserAuth, leaseId: string) {
    const lease = await this.findLease(auth, leaseId);
    await this.charges.sync(auth.companyId);
    const [charges, cheques] = await Promise.all([
      this.prisma.rentCharge.findMany({
        where: { leaseId: lease.id, kind: 'RENT', status: { not: 'CANCELLED' }, dueDate: { gte: today() } },
        orderBy: { index: 'asc' },
        select: { id: true, index: true, dueDate: true, amount: true },
      }),
      this.prisma.cheque.findMany({
        where: { leaseId: lease.id, status: { in: ['RECEIVED', 'UNDER_COLLECTION', 'CLEARED'] }, chargeId: { not: null } },
        select: { chargeId: true },
      }),
    ]);
    const covered = new Set(cheques.map((c) => c.chargeId));
    return { lease: { id: lease.id, number: lease.number }, installments: charges.filter((c) => !covered.has(c.id)) };
  }

  /** Post-dated cheques for a lease in one go: one cheque per chosen installment, numbers counting up from the first. */
  async bulk(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const lease = await this.findLease(auth, v.requiredString(src, 'leaseId', 60));
    const bankName = v.requiredString(src, 'bankName', 80);
    const firstNumber = v.requiredString(src, 'firstNumber', 40);
    const drawer = v.optionalString(src, 'drawer', 120) ?? null;
    const chargeIds = Array.isArray(src.chargeIds) ? src.chargeIds.filter((x): x is string => typeof x === 'string') : [];
    if (!chargeIds.length) throw new BadRequestException({ message: 'cheque.noInstallments', field: 'chargeIds' });
    const { installments } = await this.plan(auth, lease.id);
    const chosen = installments.filter((c) => chargeIds.includes(c.id));
    if (chosen.length !== chargeIds.length) throw new BadRequestException({ message: 'cheque.noInstallments', field: 'chargeIds' });
    const numbers = chosen.map((_, i) => nthChequeNumber(firstNumber, i));
    for (const n of numbers) await this.assertNotDuplicate(auth.companyId, bankName, n);

    await this.prisma.$transaction(
      chosen.map((c, i) =>
        this.prisma.cheque.create({
          data: {
            companyId: auth.companyId,
            tenantId: lease.tenantId,
            leaseId: lease.id,
            propertyId: lease.propertyId,
            unitId: lease.unitId,
            chargeId: c.id,
            number: numbers[i],
            bankName,
            drawer,
            amount: c.amount,
            dueDate: c.dueDate,
            createdById: auth.userId,
          },
        }),
      ),
    );
    await this.activity.log(auth, { action: 'cheque.bulkCreate', entity: 'Lease', entityId: lease.id, details: { count: chosen.length, bankName, numbers } });
    return { created: chosen.length };
  }

  /** Correct a kept cheque (number, bank, amount, date). Once deposited it can only move forward. */
  async update(auth: UserAuth, id: string, input: unknown) {
    const cheque = await this.find(auth, id);
    if (cheque.status !== 'RECEIVED') throw new BadRequestException('cheque.notEditable');
    const data = this.fields(v.body(input), false);
    if ((data.number && data.number !== cheque.number) || (data.bankName && data.bankName !== cheque.bankName)) {
      await this.assertNotDuplicate(auth.companyId, data.bankName ?? cheque.bankName, data.number ?? cheque.number, id);
    }
    const updated = await this.prisma.cheque.update({ where: { id }, data, include: INCLUDE });
    await this.activity.log(auth, { action: 'cheque.update', entity: 'Cheque', entityId: id, details: data });
    return updated;
  }

  /** Deposit / accept (إيداع): issue the receipt and credit the tenant. Not before the date on the cheque. */
  async deposit(auth: UserAuth, id: string, input: unknown) {
    const cheque = await this.find(auth, id);
    if (cheque.status !== 'RECEIVED') throw new BadRequestException('cheque.wrongStatus');
    const date = v.optionalDate(v.body(input ?? {}), 'date') ?? today();
    if (date > today()) throw new BadRequestException({ message: 'payment.futureDate', field: 'date' });
    if (date < cheque.dueDate) throw new BadRequestException({ message: 'cheque.notDueYet', field: 'date' });
    const lease = await this.findLease(auth, cheque.leaseId, true);
    await this.charges.sync(auth.companyId);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cheque.updateMany({ where: { id, status: 'RECEIVED' }, data: { status: 'UNDER_COLLECTION', depositedAt: date } });
      if (claimed.count === 0) throw new BadRequestException('cheque.wrongStatus');
      const payment = await this.payments.record(tx, auth, lease, {
        amount: cheque.amount,
        date,
        method: 'CHEQUE',
        bankName: cheque.bankName,
        chequeNo: cheque.number,
        chequeDate: cheque.dueDate,
      });
      await tx.cheque.update({ where: { id }, data: { paymentId: payment.id } });
    });
    await this.activity.log(auth, { action: 'cheque.deposit', entity: 'Cheque', entityId: id, details: { number: cheque.number } });
    return this.find(auth, id);
  }

  /** Cleared by the bank (تحصيل): the amount moves from cheques under collection to the bank. */
  async clear(auth: UserAuth, id: string, input: unknown) {
    const cheque = await this.find(auth, id);
    if (cheque.status !== 'UNDER_COLLECTION') throw new BadRequestException('cheque.wrongStatus');
    const date = v.optionalDate(v.body(input ?? {}), 'date') ?? today();
    if (date > today()) throw new BadRequestException({ message: 'payment.futureDate', field: 'date' });
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cheque.updateMany({ where: { id, status: 'UNDER_COLLECTION' }, data: { status: 'CLEARED', clearedAt: date } });
      if (claimed.count === 0) throw new BadRequestException('cheque.wrongStatus');
      const entry = await this.ledger.post(tx, {
        companyId: auth.companyId,
        date,
        type: 'CHEQUE_CLEARED',
        memo: `${cheque.number} — ${cheque.bankName} — ${cheque.lease.number}`,
        leaseId: cheque.leaseId,
        createdById: auth.userId,
        lines: chequeClearedLines(cheque.amount, this.dims(cheque)),
      });
      await tx.cheque.update({ where: { id }, data: { clearEntryId: entry.id } });
    });
    await this.activity.log(auth, { action: 'cheque.clear', entity: 'Cheque', entityId: id, details: { number: cheque.number } });
    return this.find(auth, id);
  }

  /** Bounced (مرتجع): the receipt is voided (the tenant owes again) and an optional fee is charged. */
  async bounce(auth: UserAuth, id: string, input: unknown) {
    const cheque = await this.find(auth, id);
    if (cheque.status !== 'UNDER_COLLECTION' || !cheque.paymentId) throw new BadRequestException('cheque.wrongStatus');
    const src = v.body(input ?? {});
    const reason = v.requiredString(src, 'reason', 300);
    const date = v.optionalDate(src, 'date') ?? today();
    if (date > today()) throw new BadRequestException({ message: 'payment.futureDate', field: 'date' });
    const fee = v.optionalBaisa(src, 'fee') ?? 0;
    if (fee > MAX_INT) throw new BadRequestException({ message: 'validation.invalid', field: 'fee' });
    const payment = await this.prisma.payment.findUnique({ where: { id: cheque.paymentId } });
    if (!payment) throw new NotFoundException('common.notFound');

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cheque.updateMany({
        where: { id, status: 'UNDER_COLLECTION' },
        data: { status: 'BOUNCED', bouncedAt: date, bounceReason: reason, bounceFee: fee || null },
      });
      if (claimed.count === 0) throw new BadRequestException('cheque.wrongStatus');
      await this.payments.voidInTx(tx, auth, payment, `cheque bounced: ${reason}`, date);
      if (fee > 0) {
        const last = await tx.rentCharge.findFirst({ where: { leaseId: cheque.leaseId, kind: 'FEE' }, orderBy: { index: 'desc' }, select: { index: true } });
        const charge = await tx.rentCharge.create({
          data: {
            companyId: auth.companyId,
            leaseId: cheque.leaseId,
            propertyId: cheque.propertyId,
            unitId: cheque.unitId,
            tenantId: cheque.tenantId,
            kind: 'FEE',
            index: (last?.index ?? 0) + 1,
            dueDate: date,
            amount: fee,
            status: 'POSTED',
          },
        });
        const entry = await this.ledger.post(tx, {
          companyId: auth.companyId,
          date,
          type: 'FEE_CHARGE',
          memo: `${cheque.number} — bounced cheque fee`,
          leaseId: cheque.leaseId,
          chargeId: charge.id,
          createdById: auth.userId,
          lines: chargeLines('FEE', fee, this.dims(cheque)),
        });
        await tx.rentCharge.update({ where: { id: charge.id }, data: { entryId: entry.id } });
        await tx.cheque.update({ where: { id }, data: { feeChargeId: charge.id } });
      }
    });
    await this.activity.log(auth, { action: 'cheque.bounce', entity: 'Cheque', entityId: id, details: { number: cheque.number, reason, fee } });
    return this.find(auth, id);
  }

  /** Returned to the tenant / cancelled before deposit. */
  async cancel(auth: UserAuth, id: string, input: unknown) {
    const cheque = await this.find(auth, id);
    if (cheque.status !== 'RECEIVED') throw new BadRequestException('cheque.wrongStatus');
    const reason = v.requiredString(v.body(input ?? {}), 'reason', 300);
    await this.prisma.cheque.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
    await this.activity.log(auth, { action: 'cheque.cancel', entity: 'Cheque', entityId: id, details: { number: cheque.number, reason } });
    return this.find(auth, id);
  }

  // ---------------------------------------------------------------- helpers

  private async find(auth: UserAuth, id: string) {
    const cheque = await this.prisma.cheque.findFirst({ where: { id, companyId: auth.companyId, ...this.scope(auth) }, include: INCLUDE });
    if (!cheque) throw new NotFoundException('common.notFound');
    return cheque;
  }

  private async findLease(auth: UserAuth, id: string, anyStatus = false) {
    const lease = await this.prisma.lease.findFirst({
      where: {
        id,
        companyId: auth.companyId,
        deletedAt: null,
        ...(anyStatus ? {} : { status: { not: 'DRAFT' } }),
        ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}),
      },
      include: { tenant: { select: { name: true } } },
    });
    if (!lease) throw new NotFoundException({ message: 'payment.leaseNotFound', field: 'leaseId' });
    return lease;
  }

  /** The same cheque (bank + number) cannot be registered twice unless the earlier one was cancelled. */
  private async assertNotDuplicate(companyId: string, bankName: string, number: string, exceptId?: string) {
    const clash = await this.prisma.cheque.findFirst({
      where: {
        companyId,
        number,
        bankName: { equals: bankName, mode: 'insensitive' },
        status: { not: 'CANCELLED' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException({ message: 'cheque.duplicate', field: 'number', number });
  }

  private fields(src: Record<string, unknown>, required: boolean) {
    const data: { number?: string; bankName?: string; drawer?: string | null; amount?: number; dueDate?: Date; notes?: string | null } = {};
    if (required || src.number !== undefined) data.number = v.requiredString(src, 'number', 40);
    if (required || src.bankName !== undefined) data.bankName = v.requiredString(src, 'bankName', 80);
    if (src.drawer !== undefined) data.drawer = v.optionalString(src, 'drawer', 120) ?? null;
    if (required || src.amount !== undefined) {
      const amount = v.optionalBaisa(src, 'amount');
      if (!amount || amount <= 0) throw new BadRequestException({ message: 'validation.required', field: 'amount' });
      if (amount > MAX_INT) throw new BadRequestException({ message: 'validation.invalid', field: 'amount' });
      data.amount = amount;
    }
    if (required || src.dueDate !== undefined) data.dueDate = v.requiredDate(src, 'dueDate');
    if (src.notes !== undefined) data.notes = v.optionalString(src, 'notes', 1000) ?? null;
    return data;
  }

  private scope(auth: UserAuth): Prisma.ChequeWhereInput {
    return auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {};
  }

  private dims(c: { propertyId: string; unitId: string; leaseId: string; tenantId: string }) {
    return { propertyId: c.propertyId, unitId: c.unitId, leaseId: c.leaseId, tenantId: c.tenantId };
  }
}
