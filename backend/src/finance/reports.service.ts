import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UserAuth } from '../common/auth-context.js';
import { today } from '../common/dates.js';
import * as v from '../common/validate.js';
import { ChargesService } from './charges.service.js';
import { naturalBalance, type Account } from './journal.js';
import { effectiveEnd, monthsBetween, occupancy, pct, renewalRate } from './reports.js';

const INCOME_ACCOUNTS: Account[] = ['RENT_INCOME', 'OTHER_INCOME', 'MGMT_FEE_INCOME'];
const COST_ACCOUNTS: Account[] = ['EXPENSES', 'OWNER_SHARE'];

/**
 * Reports (التقارير) — every number comes from journal lines (and, for the breakdowns, from the
 * documents those lines were posted from). Nothing is typed in.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charges: ChargesService,
  ) {}

  /** Income statement (قائمة الدخل) for a period, optionally for one property, with a monthly series. */
  async income(auth: UserAuth, query: { from?: string; to?: string; propertyId?: string }) {
    const { from, to } = this.range(query);
    await this.charges.sync(auth.companyId);
    const propertyId = query.propertyId || undefined;
    if (propertyId && auth.propertyIds && !auth.propertyIds.includes(propertyId)) throw new BadRequestException('common.notFound');
    const where: Prisma.JournalLineWhereInput = {
      ...this.lineScope(auth),
      ...(propertyId ? { propertyId } : {}),
      account: { in: [...INCOME_ACCOUNTS, ...COST_ACCOUNTS] },
      entry: { date: { gte: from, lte: to } },
    };
    const lines = await this.prisma.journalLine.findMany({ where, select: { account: true, amount: true, entry: { select: { date: true } } } });

    const months = monthsBetween(from, to);
    const series = Object.fromEntries(months.map((m) => [m, { income: 0, expenses: 0 }]));
    const totals: Record<string, number> = {};
    for (const l of lines) {
      const value = naturalBalance(l.account, l.amount);
      totals[l.account] = (totals[l.account] ?? 0) + value;
      const key = l.entry.date.toISOString().slice(0, 7);
      if (!series[key]) continue;
      if (l.account === 'RENT_INCOME' || l.account === 'OTHER_INCOME') series[key].income += value;
      if (l.account === 'EXPENSES') series[key].expenses += value;
    }
    const rent = totals.RENT_INCOME ?? 0;
    const other = totals.OTHER_INCOME ?? 0;
    const fee = totals.MGMT_FEE_INCOME ?? 0;
    const expenses = totals.EXPENSES ?? 0;
    const ownerShare = totals.OWNER_SHARE ?? 0;
    const noi = rent + other - expenses;

    // expense breakdown by item, from the posted expense documents in the period
    const byCategory = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: {
        companyId: auth.companyId,
        status: 'POSTED',
        date: { gte: from, lte: to },
        ...(propertyId ? { propertyId } : auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}),
      },
      _sum: { amount: true },
    });
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: byCategory.map((c) => c.categoryId) } },
      select: { id: true, nameAr: true, nameEn: true },
    });
    const nameOf = new Map(categories.map((c) => [c.id, c]));

    return {
      from,
      to,
      propertyId: propertyId ?? null,
      rentIncome: rent,
      otherIncome: other,
      operatingIncome: rent + other,
      expenses,
      noi,
      noiMargin: pct(noi, rent + other),
      managementFees: fee,
      ownerShare,
      companyProfit: rent + other + fee - expenses - ownerShare,
      expensesByCategory: byCategory
        .map((c) => ({ category: nameOf.get(c.categoryId) ?? null, amount: c._sum.amount ?? 0 }))
        .sort((a, b) => b.amount - a.amount),
      monthly: months.map((m) => ({ month: m, ...series[m], noi: series[m].income - series[m].expenses })),
    };
  }

  /** Property comparison (مقارنة العقارات) for a year: income, NOI, yields, occupancy, collection, vacancy, renewals, maintenance. */
  async properties(auth: UserAuth, query: { year?: string }) {
    const now = today();
    const year = Number(query.year) || now.getUTCFullYear();
    if (year < 2000 || year > now.getUTCFullYear()) throw new BadRequestException({ message: 'validation.invalid', field: 'year' });
    const from = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const to = yearEnd < now ? yearEnd : now; // the current year runs up to today
    await this.charges.sync(auth.companyId);

    const properties = await this.prisma.property.findMany({
      where: { companyId: auth.companyId, deletedAt: null, ...(auth.propertyIds ? { id: { in: auth.propertyIds } } : {}) },
      select: {
        id: true,
        name: true,
        ownership: true,
        propertyValue: true,
        investmentCost: true,
        units: { where: { deletedAt: null }, select: { id: true, createdAt: true } },
      },
      orderBy: { name: 'asc' },
    });
    const ids = properties.map((p) => p.id);

    const [sums, leases, maintenance, openOrders, billedLines, collectedLines] = await Promise.all([
      this.prisma.journalLine.groupBy({
        by: ['propertyId', 'account'],
        where: { companyId: auth.companyId, propertyId: { in: ids }, account: { in: [...INCOME_ACCOUNTS, ...COST_ACCOUNTS] }, entry: { date: { gte: from, lte: to } } },
        _sum: { amount: true },
      }),
      this.prisma.lease.findMany({
        where: { companyId: auth.companyId, propertyId: { in: ids }, deletedAt: null, status: { not: 'DRAFT' } },
        select: { id: true, propertyId: true, unitId: true, startDate: true, endDate: true, terminatedAt: true, status: true },
      }),
      this.prisma.expense.groupBy({
        by: ['propertyId'],
        where: { companyId: auth.companyId, propertyId: { in: ids }, status: 'POSTED', date: { gte: from, lte: to }, category: { isMaintenance: true } },
        _sum: { amount: true },
      }),
      this.prisma.workOrder.groupBy({
        by: ['propertyId'],
        where: { companyId: auth.companyId, propertyId: { in: ids }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        _count: { _all: true },
      }),
      this.receivableByProperty(auth, ids, from, to, ['RENT_CHARGE']),
      this.receivableByProperty(auth, ids, from, to, ['PAYMENT']),
    ]);
    const renewedFrom = new Set(
      (await this.prisma.lease.findMany({ where: { companyId: auth.companyId, renewedFromId: { in: leases.map((l) => l.id) }, deletedAt: null, status: { not: 'DRAFT' } }, select: { renewedFromId: true } })).map(
        (l) => l.renewedFromId,
      ),
    );

    const rows = properties.map((p) => {
      const get = (account: Account) => {
        const g = sums.find((s) => s.propertyId === p.id && s.account === account);
        return g ? naturalBalance(account, g._sum.amount ?? 0) : 0;
      };
      const rent = get('RENT_INCOME');
      const other = get('OTHER_INCOME');
      const expenses = get('EXPENSES');
      const income = rent + other;
      const noi = income - expenses;
      const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
      // yields are annualised when the year is still running
      const annualNoi = days >= 365 ? noi : Math.round((noi * 365) / days);
      const value = p.propertyValue ? Number(p.propertyValue) : null;
      const cost = p.investmentCost ? Number(p.investmentCost) : null;

      const propLeases = leases.filter((l) => l.propertyId === p.id);
      const occ = occupancy(
        p.units.map((u) => ({ id: u.id, availableFrom: new Date(Date.UTC(u.createdAt.getUTCFullYear(), u.createdAt.getUTCMonth(), u.createdAt.getUTCDate())) })),
        propLeases,
        from,
        to,
      );
      const ended = propLeases
        .filter((l) => {
          const end = effectiveEnd(l);
          return end >= from && end <= to && l.status !== 'ACTIVE';
        })
        .map((l) => ({ renewed: l.status === 'RENEWED' || renewedFrom.has(l.id) }));
      const billed = billedLines.get(p.id) ?? 0;
      const collected = -(collectedLines.get(p.id) ?? 0);
      const maint = maintenance.find((m) => m.propertyId === p.id)?._sum.amount ?? 0;
      const units = p.units.length;

      return {
        id: p.id,
        name: p.name,
        ownership: p.ownership,
        units,
        rentIncome: rent,
        otherIncome: other,
        expenses,
        noi,
        noiMargin: pct(noi, income),
        capRate: value ? pct(annualNoi, value) : null,
        roi: cost ? pct(annualNoi, cost) : null,
        occupancy: occ.rate,
        avgVacantDays: units ? Math.round(occ.vacantDays / units) : null,
        collectionRate: pct(collected, billed),
        renewalRate: renewalRate(ended),
        leasesEnded: ended.length,
        maintenancePerUnit: units ? Math.round(maint / units) : null,
        openWorkOrders: openOrders.find((o) => o.propertyId === p.id)?._count._all ?? 0,
      };
    });

    const sum = (k: 'rentIncome' | 'otherIncome' | 'expenses' | 'noi' | 'units') => rows.reduce((s, r) => s + r[k], 0);
    const totalIncome = sum('rentIncome') + sum('otherIncome');
    return {
      year,
      from,
      to,
      partialYear: to < yearEnd,
      properties: rows,
      totals: { units: sum('units'), rentIncome: sum('rentIncome'), otherIncome: sum('otherIncome'), expenses: sum('expenses'), noi: sum('noi'), noiMargin: pct(sum('noi'), totalIncome) },
    };
  }

  // ---------------------------------------------------------------- helpers

  /** Signed movement of tenant receivables per property from entries of these types (net of their reversals). */
  private async receivableByProperty(auth: UserAuth, ids: string[], from: Date, to: Date, types: ('RENT_CHARGE' | 'PAYMENT')[]) {
    const groups = await this.prisma.journalLine.groupBy({
      by: ['propertyId'],
      where: {
        companyId: auth.companyId,
        propertyId: { in: ids },
        account: 'TENANT_RECEIVABLE',
        entry: { date: { gte: from, lte: to }, OR: [{ type: { in: types } }, { type: 'REVERSAL', reverses: { is: { type: { in: types } } } }] },
      },
      _sum: { amount: true },
    });
    return new Map(groups.map((g) => [g.propertyId!, g._sum.amount ?? 0]));
  }

  private range(query: { from?: string; to?: string }) {
    const src = { from: query.from, to: query.to } as Record<string, unknown>;
    const from = v.requiredDate(src, 'from');
    const to = v.requiredDate(src, 'to');
    if (to < from) throw new BadRequestException({ message: 'validation.endBeforeStart', field: 'to' });
    return { from, to };
  }

  private lineScope(auth: UserAuth): Prisma.JournalLineWhereInput {
    return { companyId: auth.companyId, ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}) };
  }
}
