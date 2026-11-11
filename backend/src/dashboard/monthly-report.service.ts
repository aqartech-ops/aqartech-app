import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UserAuth } from '../common/auth-context.js';
import { addDays, today } from '../common/dates.js';
import { propertyScope } from '../properties/properties.service.js';
import { ChargesService } from '../finance/charges.service.js';
import { OwnersFinanceService } from '../finance/owners-finance.service.js';
import { naturalBalance } from '../finance/journal.js';
import { occupancy, pct } from '../finance/reports.js';
import { agingAsOf, cashFlow, change, expenseGroup, monthRange, previousMonth, unitMix, type MonthRange } from './monthly-report.js';

const EXPIRY_ALERT_DAYS = 60;
const CHEQUE_ALERT_DAYS = 7;

type Prop = {
  id: string;
  name: string;
  ownership: 'OWNED' | 'MANAGED';
  governorate: string | null;
  wilayat: string | null;
  address: string | null;
  floors: number | null;
  units: { id: string; type: string; createdAt: Date }[];
};

/** Entries of these types, and their reversals. */
const ofTypes = (types: ('PAYMENT' | 'RENT_CHARGE')[]): Prisma.JournalEntryWhereInput['OR'] => [{ type: { in: types } }, { type: 'REVERSAL', reverses: { is: { type: { in: types } } } }];

/**
 * The dashboard's monthly property report (التقرير الشهري): one property or all of them, one month.
 * Each part is included only if the user may see its section (financials, properties, tenants, maintenance, owners),
 * always within the user's properties. Every number comes from the books.
 */
@Injectable()
export class MonthlyReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charges: ChargesService,
    private readonly ownersFinance: OwnersFinanceService,
  ) {}

  private can(auth: UserAuth, section: string) {
    return ((auth.access as Record<string, string | undefined>)[section] ?? 'HIDDEN') !== 'HIDDEN';
  }

  private range(month?: string) {
    const r = monthRange(month, today());
    if (!r) throw new BadRequestException({ message: 'validation.invalid', field: 'month' });
    return r;
  }

  private properties(auth: UserAuth, propertyId?: string): Promise<Prop[]> {
    return this.prisma.property.findMany({
      where: { ...propertyScope(auth), ...(propertyId ? { id: propertyId } : {}) },
      select: {
        id: true,
        name: true,
        ownership: true,
        governorate: true,
        wilayat: true,
        address: true,
        floors: true,
        units: { where: { deletedAt: null }, select: { id: true, type: true, createdAt: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /** One report: `propertyId` = one building, nothing = all the user's buildings together. */
  async report(auth: UserAuth, query: { propertyId?: string; month?: string }) {
    const range = this.range(query.month);
    const propertyId = query.propertyId || undefined;
    const [props, options] = await Promise.all([
      this.properties(auth, propertyId),
      this.prisma.property.findMany({ where: propertyScope(auth), select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    if (propertyId && !props.length) throw new NotFoundException('common.notFound');
    await this.charges.sync(auth.companyId);
    return { properties: options, ...(await this.build(auth, props, range, !!propertyId)) };
  }

  /** Every building, one report each (the printed pack: one page per building). */
  async reportAll(auth: UserAuth, query: { month?: string }) {
    const range = this.range(query.month);
    const props = await this.properties(auth);
    await this.charges.sync(auth.companyId);
    const out = [];
    for (const p of props) out.push(await this.build(auth, [p], range, true));
    return out;
  }

  private async build(auth: UserAuth, props: Prop[], range: MonthRange, single: boolean) {
    const ids = props.map((p) => p.id);
    const prevRange = monthRange(previousMonth(range.key), today())!;
    const fin = this.can(auth, 'financials');
    const seeProps = this.can(auth, 'properties');

    const [occ, prevOcc, money, prevMoney] = await Promise.all([
      seeProps ? this.occupancy(auth, props, range) : null,
      seeProps ? this.occupancy(auth, props, prevRange) : null,
      fin ? this.money(auth, ids, range) : null,
      fin ? this.money(auth, ids, prevRange) : null,
    ]);

    const report: Record<string, unknown> = {
      month: range.key,
      current: range.current,
      from: range.from,
      to: range.to,
      propertyId: single ? props[0].id : null,
    };

    report.info = await this.info(auth, props, single);

    report.kpis = {
      occupancy: occ ? { value: occ.rate, change: change(occ.rate, prevOcc?.rate ?? null) } : null,
      collectionRate: money ? { value: money.collectionRate, change: change(money.collectionRate, prevMoney?.collectionRate ?? null) } : null,
      noi: money ? { value: money.noi, change: prevMoney ? money.noi - prevMoney.noi : null } : null,
      arrears: money ? { value: money.aging.total, change: prevMoney ? money.aging.total - prevMoney.aging.total : null } : null,
    };
    report.occupancy = occ;

    if (money) {
      report.financial = {
        rentIncome: money.rent,
        otherIncome: money.other,
        totalIncome: money.rent + money.other,
        groups: money.groups,
        expenses: money.expenses,
        noi: money.noi,
      };
      report.collection = { collected: money.collected, billed: money.billed, rate: money.collectionRate };
      report.cashFlow = await this.cash(auth, ids, range);
      report.receivables = { collected: money.collected, arrears: money.aging.total, total: money.collected + money.aging.total };
      report.aging = { buckets: money.aging.buckets, total: money.aging.total };
      report.maintenance = { byCategory: money.maintenance, total: money.maintenance.reduce((s, c) => s + c.amount, 0) };
    }
    if (this.can(auth, 'maintenance')) report.workOrders = await this.workOrders(auth, ids, range);
    if (single && fin && this.can(auth, 'owners') && props[0].ownership === 'MANAGED') report.ownerStatement = await this.ownerStatement(auth, props[0].id, range);

    // alerts are about today: shown with the current month
    if (range.current) {
      report.alerts = {
        leaseExpiry: this.can(auth, 'tenants') ? await this.expiringLeases(auth, ids) : null,
        arrears90: money ? money.aging.over90.slice(0, 12) : null,
        cheques: fin ? await this.chequeReminders(auth, ids) : null,
      };
    }
    return report;
  }

  // ---------------------------------------------------------------- parts

  private async info(auth: UserAuth, props: Prop[], single: boolean) {
    const types = props.flatMap((p) => p.units.map((u) => u.type));
    const base = { count: props.length, units: unitMix(types), floors: single ? props[0].floors : null };
    if (!single) return { ...base, name: null, address: null, owners: null, ownership: null };
    const p = props[0];
    let owners: string[] | null = null;
    if (this.can(auth, 'owners') && p.ownership === 'MANAGED') {
      const partners = await this.prisma.propertyPartner.findMany({ where: { propertyId: p.id }, select: { owner: { select: { name: true } } }, orderBy: { shareBp: 'desc' } });
      const names = partners.map((x) => x.owner.name);
      if (!names.length) {
        const agreement = await this.prisma.managementAgreement.findFirst({ where: { propertyId: p.id, status: 'ACTIVE' }, select: { owner: { select: { name: true } } }, orderBy: { startDate: 'desc' } });
        if (agreement) names.push(agreement.owner.name);
      }
      owners = names;
    }
    return { ...base, name: p.name, ownership: p.ownership, address: [p.address, p.wilayat, p.governorate].filter(Boolean).join('، ') || null, owners };
  }

  /** Occupancy over the month (occupied unit-days ÷ available unit-days) and vacant units at its last day. */
  private async occupancy(auth: UserAuth, props: Prop[], range: MonthRange) {
    const units = props.flatMap((p) => p.units);
    const leases = await this.prisma.lease.findMany({
      where: { companyId: auth.companyId, propertyId: { in: props.map((p) => p.id) }, deletedAt: null, status: { not: 'DRAFT' }, startDate: { lte: range.to } },
      select: { unitId: true, startDate: true, endDate: true, terminatedAt: true },
    });
    const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const occ = occupancy(
      units.map((u) => ({ id: u.id, availableFrom: day(u.createdAt) })),
      leases,
      range.from,
      range.to,
    );
    const occupied = new Set(
      leases.filter((l) => l.startDate <= range.to && (l.terminatedAt ? l.terminatedAt > range.to : l.endDate >= range.to)).map((l) => l.unitId),
    );
    const vacant = units.filter((u) => day(u.createdAt) <= range.to && !occupied.has(u.id));
    return { rate: occ.rate, vacant: unitMix(vacant.map((u) => u.type)), units: unitMix(units.map((u) => u.type)) };
  }

  /** Income, expenses by report group, NOI, collection and arrears for the month. */
  private async money(auth: UserAuth, ids: string[], range: MonthRange) {
    const company = auth.companyId;
    const inRange = { gte: range.from, lte: range.to };
    const [sums, expenseDocs, collectedAgg, billedAgg, charges, balances] = await Promise.all([
      this.prisma.journalLine.groupBy({
        by: ['account'],
        where: { companyId: company, propertyId: { in: ids }, account: { in: ['RENT_INCOME', 'OTHER_INCOME', 'EXPENSES'] }, entry: { date: inRange } },
        _sum: { amount: true },
      }),
      this.prisma.expense.groupBy({ by: ['categoryId'], where: { companyId: company, propertyId: { in: ids }, status: 'POSTED', date: inRange }, _sum: { amount: true } }),
      this.prisma.journalLine.aggregate({
        where: { companyId: company, propertyId: { in: ids }, account: 'TENANT_RECEIVABLE', entry: { date: inRange, OR: ofTypes(['PAYMENT']) } },
        _sum: { amount: true },
      }),
      this.prisma.journalLine.aggregate({
        where: { companyId: company, propertyId: { in: ids }, account: 'TENANT_RECEIVABLE', entry: { date: inRange, OR: ofTypes(['RENT_CHARGE']) } },
        _sum: { amount: true },
      }),
      this.prisma.rentCharge.findMany({
        where: { companyId: company, propertyId: { in: ids }, status: 'POSTED', dueDate: { lte: range.to } },
        select: { id: true, leaseId: true, tenantId: true, amount: true, dueDate: true, tenant: { select: { name: true } }, unit: { select: { number: true } } },
      }),
      this.prisma.journalLine.groupBy({
        by: ['leaseId'],
        where: { companyId: company, propertyId: { in: ids }, account: 'TENANT_RECEIVABLE', leaseId: { not: null }, entry: { date: { lte: range.to } } },
        _sum: { amount: true },
      }),
    ]);
    const get = (account: 'RENT_INCOME' | 'OTHER_INCOME' | 'EXPENSES') => naturalBalance(account, sums.find((s) => s.account === account)?._sum.amount ?? 0);
    const rent = get('RENT_INCOME');
    const other = get('OTHER_INCOME');
    const expenses = get('EXPENSES');

    const categories: { id: string; nameAr: string; nameEn: string; isMaintenance: boolean; reportGroup: string | null }[] = await this.prisma.expenseCategory.findMany({
      where: { id: { in: expenseDocs.map((e) => e.categoryId) } },
      select: { id: true, nameAr: true, nameEn: true, isMaintenance: true, reportGroup: true },
    });
    const catOf = new Map(categories.map((c) => [c.id, c]));
    const groups = { MAINTENANCE: 0, UTILITIES: 0, STAFF: 0, ADMIN: 0 };
    const maintenance: { categoryId: string; nameAr: string; nameEn: string; group: string; amount: number }[] = [];
    for (const e of expenseDocs) {
      const cat = catOf.get(e.categoryId);
      const amount = e._sum.amount ?? 0;
      const group = expenseGroup(cat ?? {});
      groups[group] += amount;
      if (cat && (group === 'MAINTENANCE' || group === 'UTILITIES')) maintenance.push({ categoryId: cat.id, nameAr: cat.nameAr, nameEn: cat.nameEn, group, amount });
    }
    // the books are the truth: anything the expense documents do not explain (e.g. a reversal dated this month) is administration
    const documented = groups.MAINTENANCE + groups.UTILITIES + groups.STAFF + groups.ADMIN;
    if (documented !== expenses) groups.ADMIN += expenses - documented;

    const collected = -(collectedAgg._sum.amount ?? 0);
    const billed = billedAgg._sum.amount ?? 0;
    const aging = agingAsOf(
      charges.map((c) => ({ id: c.id, leaseId: c.leaseId, tenantId: c.tenantId, tenantName: c.tenant.name, unit: c.unit.number, amount: c.amount, dueDate: c.dueDate })),
      new Map(balances.map((b) => [b.leaseId!, b._sum.amount ?? 0])),
      range.to,
    );
    return {
      rent,
      other,
      expenses,
      noi: rent + other - expenses,
      groups: { maintenanceUtilities: groups.MAINTENANCE + groups.UTILITIES, maintenance: groups.MAINTENANCE, utilities: groups.UTILITIES, staff: groups.STAFF, administration: groups.ADMIN },
      maintenance: maintenance.sort((a, b) => b.amount - a.amount),
      collected,
      billed,
      collectionRate: pct(collected, billed),
      aging,
    };
  }

  /** The property's cash and bank: opening balance, money in and out during the month, closing balance. */
  private async cash(auth: UserAuth, ids: string[], range: MonthRange) {
    const where = { companyId: auth.companyId, propertyId: { in: ids }, account: { in: ['CASH', 'BANK'] as ('CASH' | 'BANK')[] } };
    const [opening, lines] = await Promise.all([
      this.prisma.journalLine.aggregate({ where: { ...where, entry: { date: { lt: range.from } } }, _sum: { amount: true } }),
      this.prisma.journalLine.findMany({
        where: { ...where, entry: { date: { gte: range.from, lte: range.to } } },
        select: { amount: true, entry: { select: { date: true, type: true, reverses: { select: { type: true } } } } },
      }),
    ]);
    return cashFlow(
      [
        { amount: opening._sum.amount ?? 0, date: new Date(0), type: 'OPENING' },
        ...lines.map((l) => ({ amount: l.amount, date: l.entry.date, type: l.entry.type, reversesType: l.entry.reverses?.type ?? null })),
      ],
      range.from,
      range.to,
    );
  }

  /** Same calculation as the owner statement, plus what was transferred to the owners this month. */
  private async ownerStatement(auth: UserAuth, propertyId: string, range: MonthRange) {
    const remittedAgg = await this.prisma.ownerPayout.aggregate({
      where: { companyId: auth.companyId, propertyId, status: 'ISSUED', date: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    });
    const remitted = remittedAgg._sum.amount ?? 0;
    try {
      const s = await this.ownersFinance.compute(auth, propertyId, range.from, range.to);
      return {
        available: true,
        rentCollected: s.rentCollected,
        ownerExpenses: s.ownerExpenses,
        managementFee: s.fee.amount,
        net: s.net,
        remitted,
        balance: s.net - remitted,
        statement: s.existing,
      };
    } catch (e) {
      // e.g. no owner linked yet: the block says so instead of failing the whole dashboard
      const message = (e as { response?: { message?: string } })?.response?.message ?? (e as Error).message;
      return { available: false, reason: typeof message === 'string' ? message : 'ownerStatement.noOwners', remitted };
    }
  }

  private async workOrders(auth: UserAuth, ids: string[], range: MonthRange) {
    const base = { companyId: auth.companyId, propertyId: { in: ids } };
    const [opened, open, done] = await Promise.all([
      this.prisma.workOrder.count({ where: { ...base, createdAt: { gte: range.from, lt: addDays(range.to, 1) } } }),
      this.prisma.workOrder.count({ where: { ...base, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.workOrder.count({ where: { ...base, status: 'DONE', completedAt: { gte: range.from, lt: addDays(range.to, 1) } } }),
    ]);
    return { opened, open, done };
  }

  private async expiringLeases(auth: UserAuth, ids: string[]) {
    const now = today();
    const rows = await this.prisma.lease.findMany({
      where: { companyId: auth.companyId, propertyId: { in: ids }, deletedAt: null, status: 'ACTIVE', endDate: { gte: now, lte: addDays(now, EXPIRY_ALERT_DAYS) } },
      select: { id: true, endDate: true, unit: { select: { number: true } }, tenant: { select: { name: true } }, property: { select: { name: true } } },
      orderBy: { endDate: 'asc' },
      take: 20,
    });
    return rows.map((l) => ({ leaseId: l.id, unit: l.unit.number, tenant: l.tenant.name, property: l.property.name, endDate: l.endDate, daysLeft: Math.round((l.endDate.getTime() - now.getTime()) / 86_400_000) }));
  }

  private async chequeReminders(auth: UserAuth, ids: string[]) {
    const now = today();
    const rows = await this.prisma.cheque.findMany({
      where: { companyId: auth.companyId, propertyId: { in: ids }, status: 'RECEIVED', dueDate: { lte: addDays(now, CHEQUE_ALERT_DAYS) } },
      select: { id: true, number: true, bankName: true, amount: true, dueDate: true, unitId: true },
      orderBy: { dueDate: 'asc' },
      take: 20,
    });
    const units = await this.prisma.unit.findMany({ where: { id: { in: rows.map((r) => r.unitId) } }, select: { id: true, number: true } });
    const unitOf = new Map(units.map((u) => [u.id, u.number]));
    return rows.map((c) => ({
      chequeId: c.id,
      unit: unitOf.get(c.unitId) ?? '',
      number: c.number,
      bank: c.bankName,
      amount: c.amount,
      dueDate: c.dueDate,
      days: Math.round((c.dueDate.getTime() - now.getTime()) / 86_400_000), // negative = late
    }));
  }
}
