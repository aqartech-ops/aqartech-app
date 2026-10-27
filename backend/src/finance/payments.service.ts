import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import type { UserAuth } from '../common/auth-context.js';
import { today } from '../common/dates.js';
import * as v from '../common/validate.js';
import { ChargesService } from './charges.service.js';
import { LedgerService } from './ledger.service.js';
import { PAYMENT_METHODS, paymentLines } from './journal.js';

const INCLUDE = {
  tenant: { select: { id: true, name: true, phone: true, civilId: true } },
  lease: { select: { id: true, number: true, unit: { select: { number: true } }, property: { select: { name: true } } } },
} as const;

/**
 * Collections and receipts (التحصيل وإيصالات القبض).
 * A payment is posted to the ledger in the same transaction (Dr cash/bank/cheques, Cr tenant receivable).
 * It is never edited or deleted: a mistake is voided with a reason, which posts a reversing entry.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly ledger: LedgerService,
    private readonly charges: ChargesService,
  ) {}

  async list(auth: UserAuth, query: { tenantId?: string; leaseId?: string; method?: string; from?: string; to?: string; page?: string }) {
    const take = 50;
    const page = Math.max(1, Number(query.page) || 1);
    const where: Prisma.PaymentWhereInput = { companyId: auth.companyId, ...this.scope(auth) };
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.leaseId) where.leaseId = query.leaseId;
    if (query.method && (PAYMENT_METHODS as readonly string[]).includes(query.method)) where.method = query.method as (typeof PAYMENT_METHODS)[number];
    const range = v.body({ from: query.from, to: query.to });
    const from = query.from ? v.optionalDate(range, 'from') : undefined;
    const to = query.to ? v.optionalDate(range, 'to') : undefined;
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({ where, include: INCLUDE, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * take, take }),
      this.prisma.payment.count({ where }),
    ]);
    return { payments, total, page, pages: Math.max(1, Math.ceil(total / take)) };
  }

  /** Receipt data: the payment, the company, and what is still owed on the lease now. */
  async get(auth: UserAuth, id: string) {
    const payment = await this.prisma.payment.findFirst({ where: { id, companyId: auth.companyId, ...this.scope(auth) }, include: INCLUDE });
    if (!payment) throw new NotFoundException('common.notFound');
    const [company, balance] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: auth.companyId }, select: { name: true, phone: true, email: true } }),
      this.prisma.journalLine.aggregate({ where: { companyId: auth.companyId, account: 'TENANT_RECEIVABLE', leaseId: payment.leaseId }, _sum: { amount: true } }),
    ]);
    return { ...payment, company, leaseBalance: balance._sum.amount ?? 0 };
  }

  async create(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const lease = await this.prisma.lease.findFirst({
      where: {
        id: v.requiredString(src, 'leaseId', 60),
        companyId: auth.companyId,
        deletedAt: null,
        status: { not: 'DRAFT' },
        ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}),
      },
      include: { tenant: { select: { name: true } } },
    });
    if (!lease) throw new NotFoundException({ message: 'payment.leaseNotFound', field: 'leaseId' });
    const tenantId = v.optionalString(src, 'tenantId', 60);
    if (tenantId && tenantId !== lease.tenantId) throw new BadRequestException({ message: 'payment.leaseNotFound', field: 'leaseId' });

    const amount = v.optionalBaisa(src, 'amount');
    if (!amount || amount <= 0) throw new BadRequestException({ message: 'validation.required', field: 'amount' });
    if (amount > 2_147_483_647) throw new BadRequestException({ message: 'validation.invalid', field: 'amount' }); // Int column
    const date = v.optionalDate(src, 'date') ?? today();
    if (date > today()) throw new BadRequestException({ message: 'payment.futureDate', field: 'date' });
    const method = v.oneOf(src, 'method', PAYMENT_METHODS);

    const details = {
      reference: v.optionalString(src, 'reference', 80) ?? null,
      bankName: v.optionalString(src, 'bankName', 80) ?? null,
      chequeNo: v.optionalString(src, 'chequeNo', 40) ?? null,
      chequeDate: v.optionalDate(src, 'chequeDate') ?? null,
      notes: v.optionalString(src, 'notes', 1000) ?? null,
    };
    if (method === 'CHEQUE') {
      if (!details.chequeNo) throw new BadRequestException({ message: 'validation.required', field: 'chequeNo' });
      if (!details.bankName) throw new BadRequestException({ message: 'validation.required', field: 'bankName' });
      if (details.chequeDate && details.chequeDate > today()) {
        throw new BadRequestException({ message: 'payment.postDatedCheque', field: 'chequeDate' });
      }
    }

    // make sure every charge that is due is on the books before money is applied to it
    await this.charges.sync(auth.companyId);

    const payment = await this.prisma.$transaction(async (tx) => {
      const number = await this.ledger.nextNumber(tx, auth.companyId, 'receipt', date.getUTCFullYear(), 'R', 6);
      const entry = await this.ledger.post(tx, {
        companyId: auth.companyId,
        date,
        type: 'PAYMENT',
        memo: `${number} — ${lease.tenant.name} — ${lease.number}`,
        leaseId: lease.id,
        createdById: auth.userId,
        lines: paymentLines(method, amount, { propertyId: lease.propertyId, unitId: lease.unitId, leaseId: lease.id, tenantId: lease.tenantId }),
      });
      return tx.payment.create({
        data: {
          companyId: auth.companyId,
          number,
          tenantId: lease.tenantId,
          leaseId: lease.id,
          propertyId: lease.propertyId,
          unitId: lease.unitId,
          date,
          amount,
          method,
          ...details,
          entryId: entry.id,
          createdById: auth.userId,
        },
      });
    });
    await this.activity.log(auth, { action: 'payment.create', entity: 'Payment', entityId: payment.id, details: { number: payment.number, amount, method } });
    return this.get(auth, payment.id);
  }

  /** Void a receipt (إلغاء الإيصال): reason required; a reversing entry restores what the tenant owes. */
  async void(auth: UserAuth, id: string, input: unknown) {
    const src = v.body(input ?? {});
    const reason = v.requiredString(src, 'reason', 500);
    const payment = await this.prisma.payment.findFirst({ where: { id, companyId: auth.companyId, ...this.scope(auth) } });
    if (!payment) throw new NotFoundException('common.notFound');
    if (payment.status !== 'POSTED' || !payment.entryId) throw new BadRequestException('payment.alreadyVoided');
    const entryId = payment.entryId;
    await this.prisma.$transaction(async (tx) => {
      // claim first so two people voiding at once cannot reverse twice
      const claimed = await tx.payment.updateMany({ where: { id, status: 'POSTED' }, data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason } });
      if (claimed.count === 0) throw new BadRequestException('payment.alreadyVoided');
      const reversal = await this.ledger.reverse(tx, auth.companyId, entryId, {
        date: today(),
        memo: `${payment.number} — void: ${reason}`,
        createdById: auth.userId,
      });
      await tx.payment.update({ where: { id }, data: { voidEntryId: reversal.id } });
    });
    await this.activity.log(auth, { action: 'payment.void', entity: 'Payment', entityId: id, details: { number: payment.number, reason } });
    return this.get(auth, id);
  }

  private scope(auth: UserAuth): Prisma.PaymentWhereInput {
    return auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {};
  }
}
