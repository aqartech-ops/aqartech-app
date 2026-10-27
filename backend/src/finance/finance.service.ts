import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UserAuth } from '../common/auth-context.js';
import { addDays, daysBetween, monthStart, today } from '../common/dates.js';
import { ChargesService } from './charges.service.js';
import { ACCOUNTS, agingBucket, naturalBalance, openItems, withRunningBalance, type Account } from './journal.js';

const UPCOMING_DAYS = 30;
const BUCKETS = ['0_30', '31_60', '61_90', '90_plus'] as const;

/**
 * Financial reads (التقارير المالية). Every figure is computed from journal lines and saved charges —
 * nothing is typed in. Users limited to some properties only see lines of those properties.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charges: ChargesService,
  ) {}

  /** Headline numbers for the Financials page and the dashboard. */
  async summary(auth: UserAuth) {
    await this.charges.sync(auth.companyId);
    const now = today();
    const [balances, monthIncome, yearIncome, open, upcoming] = await Promise.all([
      this.accountSums(auth),
      this.incomeSince(auth, monthStart(now)),
      this.incomeSince(auth, new Date(Date.UTC(now.getUTCFullYear(), 0, 1))),
      this.openCharges(auth),
      this.prisma.rentCharge.aggregate({
        where: { ...this.chargeScope(auth), status: 'SCHEDULED', dueDate: { gt: now, lte: addDays(now, UPCOMING_DAYS) } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    const overdue = open.filter((c) => c.daysOverdue > 0);
    const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<(typeof BUCKETS)[number], number>;
    for (const c of overdue) buckets[c.bucket!] += c.outstanding;
    return {
      asOf: now,
      receivable: naturalBalance('TENANT_RECEIVABLE', balances.TENANT_RECEIVABLE),
      depositsHeld: naturalBalance('SECURITY_DEPOSITS', balances.SECURITY_DEPOSITS),
      rentIncome: { month: monthIncome, year: yearIncome },
      overdue: { total: overdue.reduce((s, c) => s + c.outstanding, 0), count: overdue.length, buckets },
      dueToday: open.filter((c) => c.daysOverdue === 0).reduce((s, c) => s + c.outstanding, 0),
      upcoming: { total: upcoming._sum.amount ?? 0, count: upcoming._count, days: UPCOMING_DAYS },
    };
  }

  /** filter: overdue | open (unpaid, due) | upcoming (next 30 days) */
  async receivables(auth: UserAuth, query: { filter?: string; tenantId?: string; propertyId?: string }) {
    await this.charges.sync(auth.companyId);
    if (query.filter === 'upcoming') {
      const now = today();
      const rows = await this.prisma.rentCharge.findMany({
        where: {
          ...this.chargeScope(auth),
          status: 'SCHEDULED',
          dueDate: { gt: now, lte: addDays(now, UPCOMING_DAYS) },
          ...(query.tenantId ? { tenantId: query.tenantId } : {}),
          ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        },
        include: CHARGE_INCLUDE,
        orderBy: { dueDate: 'asc' },
      });
      return rows.map((c) => ({ ...shapeCharge(c), outstanding: c.amount, daysOverdue: 0, bucket: null }));
    }
    let open = await this.openCharges(auth, query.tenantId);
    if (query.propertyId) open = open.filter((c) => c.propertyId === query.propertyId);
    if (query.filter === 'overdue') open = open.filter((c) => c.daysOverdue > 0);
    return open.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }

  /** What each tenant owes now (receivable), how much of it is overdue, and the deposit held. */
  async balances(auth: UserAuth) {
    await this.charges.sync(auth.companyId);
    const lines = await this.prisma.journalLine.groupBy({
      by: ['tenantId', 'account'],
      where: { ...this.lineScope(auth), tenantId: { not: null }, account: { in: ['TENANT_RECEIVABLE', 'SECURITY_DEPOSITS'] } },
      _sum: { amount: true },
    });
    const byTenant = new Map<string, { receivable: number; deposit: number }>();
    for (const g of lines) {
      const row = byTenant.get(g.tenantId!) ?? { receivable: 0, deposit: 0 };
      if (g.account === 'TENANT_RECEIVABLE') row.receivable += g._sum.amount ?? 0;
      else row.deposit += -(g._sum.amount ?? 0);
      byTenant.set(g.tenantId!, row);
    }
    const overdueBy = new Map<string, number>();
    for (const c of await this.openCharges(auth)) {
      if (c.daysOverdue > 0) overdueBy.set(c.tenant.id, (overdueBy.get(c.tenant.id) ?? 0) + c.outstanding);
    }
    const tenants = await this.prisma.tenant.findMany({
      where: { companyId: auth.companyId, id: { in: [...byTenant.keys()] } },
      select: { id: true, name: true, phone: true },
    });
    return tenants
      .map((t) => ({ ...t, ...byTenant.get(t.id)!, overdue: overdueBy.get(t.id) ?? 0 }))
      .filter((t) => t.receivable !== 0 || t.deposit !== 0)
      .sort((a, b) => b.overdue - a.overdue || b.receivable - a.receivable);
  }

  /** Tenant statement (كشف حساب المستأجر): every receivable movement with a running balance. */
  async statement(auth: UserAuth, tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, companyId: auth.companyId }, select: { id: true, name: true, phone: true } });
    if (!tenant) throw new NotFoundException('common.notFound');
    await this.charges.sync(auth.companyId);
    const lines = await this.prisma.journalLine.findMany({
      where: { ...this.lineScope(auth), tenantId, account: 'TENANT_RECEIVABLE' },
      include: { entry: { select: { id: true, number: true, date: true, type: true, memo: true, createdAt: true } } },
    });
    lines.sort((a, b) => a.entry.date.getTime() - b.entry.date.getTime() || a.entry.createdAt.getTime() - b.entry.createdAt.getTime());
    const rows = withRunningBalance(
      lines.map((l) => ({ id: l.id, date: l.entry.date, number: l.entry.number, type: l.entry.type, memo: l.entry.memo, amount: l.amount })),
    );
    const deposit = await this.prisma.journalLine.aggregate({
      where: { ...this.lineScope(auth), tenantId, account: 'SECURITY_DEPOSITS' },
      _sum: { amount: true },
    });
    return { tenant, rows, balance: rows.at(-1)?.balance ?? 0, depositHeld: -(deposit._sum.amount ?? 0) };
  }

  /** Journal (سجل القيود): newest first, 30 per page. */
  async journal(auth: UserAuth, page = 1) {
    const take = 30;
    const where: Prisma.JournalEntryWhereInput = {
      companyId: auth.companyId,
      ...(auth.propertyIds ? { lines: { some: { propertyId: { in: auth.propertyIds } } } } : {}),
    };
    const [entries, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (Math.max(1, page) - 1) * take,
        take,
        include: { lines: { select: { id: true, account: true, amount: true } }, reverses: { select: { number: true } }, reversedBy: { select: { number: true } } },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { entries, total, page, pages: Math.max(1, Math.ceil(total / take)) };
  }

  /** Trial balance (ميزان المراجعة): balance per account; debits and credits must match (total = 0). */
  async trialBalance(auth: UserAuth) {
    await this.charges.sync(auth.companyId);
    const sums = await this.accountSums(auth);
    const accounts = ACCOUNTS.map((account) => ({
      account,
      debit: sums[account] > 0 ? sums[account] : 0,
      credit: sums[account] < 0 ? -sums[account] : 0,
      balance: naturalBalance(account, sums[account]),
    }));
    const debit = accounts.reduce((s, a) => s + a.debit, 0);
    const credit = accounts.reduce((s, a) => s + a.credit, 0);
    return { accounts, debit, credit, balanced: debit === credit };
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Unpaid charges (posted, not cancelled) with what is still outstanding on each.
   * Per tenant, the receivable balance from the ledger is spread over the newest charges (oldest are paid first).
   */
  async openCharges(auth: UserAuth, tenantId?: string) {
    const now = today();
    const [charges, receivables] = await Promise.all([
      this.prisma.rentCharge.findMany({
        where: { ...this.chargeScope(auth), status: 'POSTED', ...(tenantId ? { tenantId } : {}) },
        include: CHARGE_INCLUDE,
      }),
      this.prisma.journalLine.groupBy({
        by: ['tenantId'],
        where: { ...this.lineScope(auth), account: 'TENANT_RECEIVABLE', tenantId: tenantId ?? { not: null } },
        _sum: { amount: true },
      }),
    ]);
    const balanceOf = new Map(receivables.map((g) => [g.tenantId!, g._sum.amount ?? 0]));
    const byTenant = new Map<string, typeof charges>();
    for (const c of charges) byTenant.set(c.tenantId, [...(byTenant.get(c.tenantId) ?? []), c]);
    const result: (ReturnType<typeof shapeCharge> & { outstanding: number; daysOverdue: number; bucket: ReturnType<typeof agingBucket> })[] = [];
    for (const [tid, list] of byTenant) {
      for (const c of openItems(list, balanceOf.get(tid) ?? 0)) {
        if (c.outstanding <= 0) continue;
        const daysOverdue = Math.max(0, daysBetween(c.dueDate, now));
        result.push({ ...shapeCharge(c), outstanding: c.outstanding, daysOverdue, bucket: agingBucket(daysOverdue) });
      }
    }
    return result;
  }

  private async accountSums(auth: UserAuth): Promise<Record<Account, number>> {
    const groups = await this.prisma.journalLine.groupBy({ by: ['account'], where: this.lineScope(auth), _sum: { amount: true } });
    const out = Object.fromEntries(ACCOUNTS.map((a) => [a, 0])) as Record<Account, number>;
    for (const g of groups) out[g.account] = g._sum.amount ?? 0;
    return out;
  }

  private async incomeSince(auth: UserAuth, from: Date) {
    const agg = await this.prisma.journalLine.aggregate({
      where: { ...this.lineScope(auth), account: 'RENT_INCOME', entry: { date: { gte: from, lte: today() } } },
      _sum: { amount: true },
    });
    return naturalBalance('RENT_INCOME', agg._sum.amount ?? 0);
  }

  private lineScope(auth: UserAuth): Prisma.JournalLineWhereInput {
    return { companyId: auth.companyId, ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}) };
  }

  private chargeScope(auth: UserAuth): Prisma.RentChargeWhereInput {
    return { companyId: auth.companyId, ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}) };
  }
}

const CHARGE_INCLUDE = {
  tenant: { select: { id: true, name: true, phone: true } },
  unit: { select: { id: true, number: true } },
  property: { select: { id: true, name: true } },
  lease: { select: { id: true, number: true } },
} as const;

type ChargeWithRefs = Prisma.RentChargeGetPayload<{ include: typeof CHARGE_INCLUDE }>;

function shapeCharge(c: ChargeWithRefs) {
  return {
    id: c.id,
    kind: c.kind,
    index: c.index,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    dueDate: c.dueDate,
    amount: c.amount,
    status: c.status,
    propertyId: c.propertyId,
    tenant: c.tenant,
    unit: c.unit,
    property: c.property,
    lease: c.lease,
  };
}

