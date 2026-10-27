import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import type { UserAuth } from '../common/auth-context.js';
import { addDays, today } from '../common/dates.js';
import * as v from '../common/validate.js';
import { ChargesService } from './charges.service.js';
import { LedgerService } from './ledger.service.js';
import { pair, withRunningBalance } from './journal.js';
import { allocateByKind, managementFee, splitByShares, statementLines } from './owner-statement.js';

const MAX_INT = 2_147_483_647;
const PAID_FROM = ['CASH', 'BANK'] as const;

/**
 * Owner statements and payouts (كشوف الملاك والتحويلات) for MANAGED properties.
 *   rent collected (cash basis, deposits and tenant fees excluded)
 * − expenses borne by the owner
 * − management fee (agreement: % of collected / % of due / fixed)
 * = net, split between the partners by their shares.
 * Issuing posts the owners' shares as amounts owed to them; payouts settle those amounts.
 */
@Injectable()
export class OwnersFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly ledger: LedgerService,
    private readonly charges: ChargesService,
  ) {}

  /** Live calculation (nothing saved) — the preview the user checks before issuing. */
  async compute(auth: UserAuth, propertyId: string, from: Date, to: Date) {
    if (to < from) throw new BadRequestException({ message: 'validation.endBeforeStart', field: 'to' });
    if (to > today()) throw new BadRequestException({ message: 'ownerStatement.futurePeriod', field: 'to' });
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, companyId: auth.companyId, deletedAt: null },
      select: { id: true, name: true, ownership: true },
    });
    if (!property || (auth.propertyIds && !auth.propertyIds.includes(property.id))) throw new NotFoundException('common.notFound');
    if (property.ownership !== 'MANAGED') throw new BadRequestException('ownerStatement.notManaged');
    await this.charges.sync(auth.companyId);

    // agreement in force during the period (latest start first)
    const agreement = await this.prisma.managementAgreement.findFirst({
      where: { propertyId, companyId: auth.companyId, startDate: { lte: to }, OR: [{ endDate: null }, { endDate: { gte: from } }] },
      orderBy: { startDate: 'desc' },
      include: { owner: { select: { id: true, name: true } } },
    });
    const partners = await this.prisma.propertyPartner.findMany({
      where: { propertyId },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { shareBp: 'desc' },
    });
    const owners = partners.length
      ? partners.map((p) => ({ ownerId: p.ownerId, name: p.owner.name, shareBp: p.shareBp }))
      : agreement
        ? [{ ownerId: agreement.ownerId, name: agreement.owner.name, shareBp: 10000 }]
        : [];
    if (!owners.length) throw new BadRequestException('ownerStatement.noOwners');

    // rent collected per lease: allocation of net payments at the end − before the start
    const leases = await this.prisma.lease.findMany({
      where: { propertyId, companyId: auth.companyId, deletedAt: null, status: { not: 'DRAFT' } },
      select: { id: true, number: true, tenant: { select: { name: true } }, unit: { select: { number: true } } },
    });
    const dayBefore = addDays(from, -1);
    const perLease: { leaseId: string; number: string; tenant: string; unit: string; collected: number; due: number }[] = [];
    let rentCollected = 0;
    let rentDue = 0;
    for (const lease of leases) {
      const [charges, paymentLines] = await Promise.all([
        this.prisma.rentCharge.findMany({
          where: { leaseId: lease.id, status: { not: 'CANCELLED' } },
          select: { kind: true, amount: true, dueDate: true, index: true },
        }),
        this.prisma.journalLine.findMany({
          where: {
            companyId: auth.companyId,
            leaseId: lease.id,
            account: 'TENANT_RECEIVABLE',
            entry: { date: { lte: to }, OR: [{ type: 'PAYMENT' }, { type: 'REVERSAL', reverses: { is: { type: 'PAYMENT' } } }] },
          },
          select: { amount: true, entry: { select: { date: true } } },
        }),
      ]);
      const paidBy = (t: Date) => -paymentLines.filter((l) => l.entry.date <= t).reduce((s, l) => s + l.amount, 0);
      const collected = allocateByKind(charges, paidBy(to)).RENT - allocateByKind(charges, paidBy(dayBefore)).RENT;
      const due = charges.filter((c) => c.kind === 'RENT' && c.dueDate >= from && c.dueDate <= to).reduce((s, c) => s + c.amount, 0);
      rentCollected += collected;
      rentDue += due;
      if (collected || due) perLease.push({ leaseId: lease.id, number: lease.number, tenant: lease.tenant.name, unit: lease.unit.number, collected, due });
    }

    const expenses = await this.prisma.expense.findMany({
      where: { companyId: auth.companyId, propertyId, bearer: 'OWNER', status: 'POSTED', date: { gte: from, lte: to } },
      include: { category: { select: { nameAr: true, nameEn: true } }, unit: { select: { number: true } } },
      orderBy: { date: 'asc' },
    });
    const ownerExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    const fee = agreement
      ? managementFee(agreement.feeMethod, agreement.feeRateBp, agreement.feeFixed, rentCollected, rentDue)
      : { base: 0, amount: 0 };
    const net = rentCollected - ownerExpenses - fee.amount;
    const splits = splitByShares(net, owners);

    const existing = await this.prisma.ownerStatement.findFirst({
      where: { propertyId, status: 'ISSUED', periodStart: { lte: to }, periodEnd: { gte: from } },
      select: { id: true, number: true },
    });

    return {
      property: { id: property.id, name: property.name },
      periodStart: from,
      periodEnd: to,
      agreement: agreement
        ? { id: agreement.id, feeMethod: agreement.feeMethod, feeRateBp: agreement.feeRateBp, feeFixed: agreement.feeFixed, owner: agreement.owner }
        : null,
      rentCollected,
      rentDue,
      leases: perLease,
      expenses: expenses.map((e) => ({ id: e.id, number: e.number, date: e.date, description: e.description, amount: e.amount, category: e.category, unit: e.unit?.number ?? null })),
      ownerExpenses,
      fee,
      net,
      splits,
      existing,
    };
  }

  async preview(auth: UserAuth, query: { propertyId?: string; from?: string; to?: string }) {
    const { propertyId, from, to } = this.period(query);
    return this.compute(auth, propertyId, from, to);
  }

  async issue(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const { propertyId, from, to } = this.period(src);
    const s = await this.compute(auth, propertyId, from, to);
    if (s.existing) throw new ConflictException({ message: 'ownerStatement.overlap', number: s.existing.number });
    if ([s.net, s.fee.amount, s.rentCollected].some((x) => Math.abs(x) > MAX_INT)) throw new BadRequestException('validation.invalid');
    const year = to.getUTCFullYear();
    const statement = await this.prisma.$transaction(async (tx) => {
      // re-check inside the transaction: two people issuing the same month at once
      const clash = await tx.ownerStatement.findFirst({ where: { propertyId, status: 'ISSUED', periodStart: { lte: to }, periodEnd: { gte: from } } });
      if (clash) throw new ConflictException({ message: 'ownerStatement.overlap', number: clash.number });
      const number = await this.ledger.nextNumber(tx, auth.companyId, 'ownerstatement', year, 'OS', 4);
      const lines = statementLines(s.net, s.fee.amount, s.splits, propertyId);
      const entry =
        lines.length >= 2
          ? await this.ledger.post(tx, { companyId: auth.companyId, date: to, type: 'OWNER_STATEMENT', memo: `${number} — ${s.property.name}`, createdById: auth.userId, lines })
          : null;
      return tx.ownerStatement.create({
        data: {
          companyId: auth.companyId,
          number,
          propertyId,
          ownerId: s.agreement?.owner.id ?? s.splits[0]?.ownerId ?? null,
          periodStart: from,
          periodEnd: to,
          rentCollected: s.rentCollected,
          rentDue: s.rentDue,
          ownerExpenses: s.ownerExpenses,
          feeAmount: s.fee.amount,
          net: s.net,
          details: JSON.parse(JSON.stringify({ agreement: s.agreement, fee: s.fee, leases: s.leases, expenses: s.expenses, splits: s.splits })) as Prisma.InputJsonValue,
          entryId: entry?.id ?? null,
          createdById: auth.userId,
        },
      });
    });
    await this.activity.log(auth, { action: 'ownerStatement.issue', entity: 'OwnerStatement', entityId: statement.id, details: { number: statement.number, net: s.net } });
    return this.get(auth, statement.id);
  }

  async list(auth: UserAuth, query: { propertyId?: string; ownerId?: string }) {
    const where: Prisma.OwnerStatementWhereInput = { companyId: auth.companyId, ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}) };
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.ownerId) where.OR = [{ ownerId: query.ownerId }, { details: { path: ['splits'], array_contains: [{ ownerId: query.ownerId }] } }];
    return this.prisma.ownerStatement.findMany({
      where,
      include: { property: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } },
      orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async get(auth: UserAuth, id: string) {
    const st = await this.prisma.ownerStatement.findFirst({
      where: { id, companyId: auth.companyId, ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}) },
      include: { property: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } },
    });
    if (!st) throw new NotFoundException('common.notFound');
    const company = await this.prisma.company.findUnique({ where: { id: auth.companyId }, select: { name: true, phone: true, email: true } });
    return { ...st, company };
  }

  async voidStatement(auth: UserAuth, id: string, input: unknown) {
    const reason = v.requiredString(v.body(input ?? {}), 'reason', 500);
    const st = await this.get(auth, id);
    if (st.status !== 'ISSUED') throw new BadRequestException('ownerStatement.alreadyVoided');
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.ownerStatement.updateMany({ where: { id, status: 'ISSUED' }, data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason } });
      if (claimed.count === 0) throw new BadRequestException('ownerStatement.alreadyVoided');
      if (st.entryId) await this.ledger.reverse(tx, auth.companyId, st.entryId, { date: today(), memo: `${st.number} — void: ${reason}`, createdById: auth.userId });
    });
    await this.activity.log(auth, { action: 'ownerStatement.void', entity: 'OwnerStatement', entityId: id, details: { number: st.number, reason } });
    return this.get(auth, id);
  }

  // ---------------------------------------------------------------- owner accounts & payouts

  /** What the company owes each owner now (issued statements − payouts). */
  async balances(auth: UserAuth) {
    const groups = await this.prisma.journalLine.groupBy({
      by: ['ownerId'],
      where: { companyId: auth.companyId, account: 'OWNER_PAYABLE', ownerId: { not: null }, ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}) },
      _sum: { amount: true },
    });
    const owners = await this.prisma.owner.findMany({
      where: { companyId: auth.companyId, deletedAt: null },
      select: { id: true, name: true, phone: true, bankName: true, accountNumber: true },
      orderBy: { name: 'asc' },
    });
    const owed = new Map(groups.map((g) => [g.ownerId!, -(g._sum.amount ?? 0)]));
    const lastPayouts = await this.prisma.ownerPayout.groupBy({ by: ['ownerId'], where: { companyId: auth.companyId, status: 'ISSUED' }, _max: { date: true } });
    const lastOf = new Map(lastPayouts.map((p) => [p.ownerId, p._max.date]));
    return owners
      .filter((o) => owed.has(o.id) || lastOf.has(o.id))
      .map((o) => ({ ...o, balance: owed.get(o.id) ?? 0, lastPayout: lastOf.get(o.id) ?? null }))
      .sort((a, b) => b.balance - a.balance);
  }

  /** Owner account (حساب المالك): statements credited, payouts debited, running balance. */
  async ownerAccount(auth: UserAuth, ownerId: string) {
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, companyId: auth.companyId },
      select: { id: true, name: true, phone: true, bankName: true, accountName: true, accountNumber: true },
    });
    if (!owner) throw new NotFoundException('common.notFound');
    const lines = await this.prisma.journalLine.findMany({
      where: { companyId: auth.companyId, account: 'OWNER_PAYABLE', ownerId, ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}) },
      include: { entry: { select: { number: true, date: true, type: true, memo: true, createdAt: true } } },
    });
    lines.sort((a, b) => a.entry.date.getTime() - b.entry.date.getTime() || a.entry.createdAt.getTime() - b.entry.createdAt.getTime());
    // natural direction: what we owe the owner (credits) is positive
    const rows = withRunningBalance(lines.map((l) => ({ id: l.id, date: l.entry.date, number: l.entry.number, type: l.entry.type, memo: l.entry.memo, amount: -l.amount })));
    const payouts = await this.prisma.ownerPayout.findMany({ where: { companyId: auth.companyId, ownerId }, orderBy: { date: 'desc' }, take: 50 });
    return { owner, rows, balance: rows.at(-1)?.balance ?? 0, payouts };
  }

  async payout(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const ownerId = v.requiredString(src, 'ownerId', 60);
    const owner = await this.prisma.owner.findFirst({ where: { id: ownerId, companyId: auth.companyId, deletedAt: null }, select: { id: true, name: true } });
    if (!owner) throw new NotFoundException({ message: 'common.notFound', field: 'ownerId' });
    const amount = v.optionalBaisa(src, 'amount');
    if (!amount || amount <= 0) throw new BadRequestException({ message: 'validation.required', field: 'amount' });
    if (amount > MAX_INT) throw new BadRequestException({ message: 'validation.invalid', field: 'amount' });
    const date = v.optionalDate(src, 'date') ?? today();
    if (date > today()) throw new BadRequestException({ message: 'payment.futureDate', field: 'date' });
    const paidFrom = v.oneOf(src, 'paidFrom', PAID_FROM, 'BANK');
    const propertyId = v.optionalString(src, 'propertyId', 60) ?? null;
    if (auth.propertyIds && (!propertyId || !auth.propertyIds.includes(propertyId))) {
      throw new BadRequestException({ message: 'expense.propertyRequired', field: 'propertyId' });
    }
    const payout = await this.prisma.$transaction(async (tx) => {
      const number = await this.ledger.nextNumber(tx, auth.companyId, 'ownerpayout', date.getUTCFullYear(), 'OP', 4);
      const entry = await this.ledger.post(tx, {
        companyId: auth.companyId,
        date,
        type: 'OWNER_PAYOUT',
        memo: `${number} — ${owner.name}`,
        createdById: auth.userId,
        lines: pair('OWNER_PAYABLE', paidFrom, amount, { ownerId, propertyId }),
      });
      return tx.ownerPayout.create({
        data: {
          companyId: auth.companyId,
          number,
          ownerId,
          propertyId,
          date,
          amount,
          paidFrom,
          reference: v.optionalString(src, 'reference', 80) ?? null,
          notes: v.optionalString(src, 'notes', 1000) ?? null,
          entryId: entry.id,
          createdById: auth.userId,
        },
      });
    });
    await this.activity.log(auth, { action: 'ownerPayout.create', entity: 'OwnerPayout', entityId: payout.id, details: { number: payout.number, amount } });
    return payout;
  }

  async voidPayout(auth: UserAuth, id: string, input: unknown) {
    const reason = v.requiredString(v.body(input ?? {}), 'reason', 500);
    const payout = await this.prisma.ownerPayout.findFirst({ where: { id, companyId: auth.companyId } });
    if (!payout) throw new NotFoundException('common.notFound');
    if (payout.status !== 'ISSUED' || !payout.entryId) throw new BadRequestException('ownerStatement.alreadyVoided');
    const entryId = payout.entryId;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.ownerPayout.updateMany({ where: { id, status: 'ISSUED' }, data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason } });
      if (claimed.count === 0) throw new BadRequestException('ownerStatement.alreadyVoided');
      await this.ledger.reverse(tx, auth.companyId, entryId, { date: today(), memo: `${payout.number} — void: ${reason}`, createdById: auth.userId });
    });
    await this.activity.log(auth, { action: 'ownerPayout.void', entity: 'OwnerPayout', entityId: id, details: { number: payout.number, reason } });
    return { ok: true };
  }

  /** Managed properties the caller may see — for the statement form. */
  managedProperties(auth: UserAuth) {
    return this.prisma.property.findMany({
      where: { companyId: auth.companyId, deletedAt: null, ownership: 'MANAGED', ...(auth.propertyIds ? { id: { in: auth.propertyIds } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private period(src: Record<string, unknown>) {
    const propertyId = v.requiredString(src, 'propertyId', 60);
    const from = v.requiredDate(src, 'from');
    const to = v.requiredDate(src, 'to');
    return { propertyId, from, to };
  }
}
