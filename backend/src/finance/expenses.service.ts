import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CostBearer, PaidFrom, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import type { UserAuth } from '../common/auth-context.js';
import { today } from '../common/dates.js';
import * as v from '../common/validate.js';
import { LedgerService } from './ledger.service.js';
import { chargeLines, defaultBearer, expenseLines } from './journal.js';
import { FieldsService } from '../fields/fields.module.js';

type Tx = Prisma.TransactionClient;
const MAX_INT = 2_147_483_647;
export const BEARERS = ['OWNER', 'COMPANY', 'TENANT'] as const;
export const PAID_FROM = ['CASH', 'BANK'] as const;

/** Starting list of expense items; each company edits its own copy. */
const DEFAULT_CATEGORIES: { nameAr: string; nameEn: string; isMaintenance?: boolean; systemKey?: string }[] = [
  { nameAr: 'صيانة وإصلاحات', nameEn: 'Maintenance & repairs', isMaintenance: true },
  { nameAr: 'كهرباء ومياه', nameEn: 'Electricity & water' },
  { nameAr: 'رواتب', nameEn: 'Salaries' },
  { nameAr: 'نظافة', nameEn: 'Cleaning' },
  { nameAr: 'حراسة وأمن', nameEn: 'Security' },
  { nameAr: 'تأمين', nameEn: 'Insurance' },
  { nameAr: 'رسوم بلدية وحكومية', nameEn: 'Municipality & government fees', systemKey: 'municipality' },
  { nameAr: 'تسويق وعمولات', nameEn: 'Marketing & commissions' },
  { nameAr: 'مصاريف إدارية', nameEn: 'Administrative' },
  { nameAr: 'أخرى', nameEn: 'Other' },
];

const INCLUDE = {
  category: { select: { id: true, nameAr: true, nameEn: true } },
  property: { select: { id: true, name: true } },
  unit: { select: { id: true, number: true } },
  vendor: { select: { id: true, name: true } },
  workOrder: { select: { id: true, number: true } },
} as const;

export type ExpenseInput = {
  date: Date;
  amount: number;
  categoryId: string;
  propertyId: string | null;
  unitId: string | null;
  vendorId: string | null;
  bearer: CostBearer;
  paidFrom: PaidFrom;
  description: string;
  invoiceNo: string | null;
  workOrderId?: string | null;
  custom?: Prisma.InputJsonValue;
};

/**
 * Expenses (المصروفات): posted to the ledger when recorded (Dr expenses / Cr cash or bank).
 * Bearer: OWNER (deducted in the owner statement), COMPANY, or TENANT (charged back to the unit's current lease).
 * Never edited or deleted — voiding posts reversing entries.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly ledger: LedgerService,
    private readonly fields: FieldsService,
  ) {}

  // ---------------------------------------------------------------- categories

  async categories(auth: UserAuth, all = false) {
    await this.ensureCategories(auth.companyId);
    return this.prisma.expenseCategory.findMany({
      where: { companyId: auth.companyId, ...(all ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async saveCategory(auth: UserAuth, id: string | null, input: unknown) {
    const src = v.body(input);
    const data: Prisma.ExpenseCategoryUncheckedUpdateInput = {};
    if (!id || src.nameAr !== undefined) data.nameAr = v.requiredString(src, 'nameAr', 80);
    if (!id || src.nameEn !== undefined) data.nameEn = v.requiredString(src, 'nameEn', 80);
    if (src.isActive !== undefined) data.isActive = v.optionalBoolean(src, 'isActive');
    if (src.sortOrder !== undefined) data.sortOrder = v.nonNegativeInt(src, 'sortOrder');
    if (id) {
      await this.findCategory(auth, id, true);
      const updated = await this.prisma.expenseCategory.update({ where: { id }, data });
      await this.activity.log(auth, { action: 'expenseCategory.update', entity: 'ExpenseCategory', entityId: id, details: data });
      return updated;
    }
    const count = await this.prisma.expenseCategory.count({ where: { companyId: auth.companyId } });
    const created = await this.prisma.expenseCategory.create({
      data: { ...(data as Prisma.ExpenseCategoryUncheckedCreateInput), companyId: auth.companyId, sortOrder: count + 1 },
    });
    await this.activity.log(auth, { action: 'expenseCategory.create', entity: 'ExpenseCategory', entityId: created.id, details: data });
    return created;
  }

  /** Vendors for the expense form (read-only here; managed in the maintenance section). */
  vendors(auth: UserAuth) {
    return this.prisma.vendor.findMany({ where: { companyId: auth.companyId, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, specialty: true } });
  }

  // ---------------------------------------------------------------- expenses

  async list(auth: UserAuth, query: { from?: string; to?: string; propertyId?: string; categoryId?: string; bearer?: string; page?: string; all?: string }) {
    const take = query.all === '1' ? 5000 : 50; // all=1: export (تصدير)
    const page = Math.max(1, Number(query.page) || 1);
    const where: Prisma.ExpenseWhereInput = { companyId: auth.companyId, ...this.scope(auth) };
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.bearer && (BEARERS as readonly string[]).includes(query.bearer)) where.bearer = query.bearer as CostBearer;
    const range = { from: query.from, to: query.to } as Record<string, unknown>;
    const from = query.from ? v.optionalDate(range, 'from') : null;
    const to = query.to ? v.optionalDate(range, 'to') : null;
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const [expenses, total, sum] = await Promise.all([
      this.prisma.expense.findMany({ where, include: INCLUDE, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * take, take }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where: { ...where, status: 'POSTED' }, _sum: { amount: true } }),
    ]);
    return { expenses, total, page, pages: Math.max(1, Math.ceil(total / take)), sum: sum._sum.amount ?? 0 };
  }

  async get(auth: UserAuth, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, companyId: auth.companyId, ...this.scope(auth) }, include: INCLUDE });
    if (!expense) throw new NotFoundException('common.notFound');
    return expense;
  }

  /** Validates an untrusted body into an ExpenseInput (shared with work-order completion). */
  async parse(auth: UserAuth, src: Record<string, unknown>, defaults: Partial<ExpenseInput> = {}): Promise<ExpenseInput> {
    const amount = v.optionalBaisa(src, 'amount');
    if (!amount || amount <= 0) throw new BadRequestException({ message: 'validation.required', field: 'amount' });
    if (amount > MAX_INT) throw new BadRequestException({ message: 'validation.invalid', field: 'amount' });
    const date = v.optionalDate(src, 'date') ?? today();
    if (date > today()) throw new BadRequestException({ message: 'payment.futureDate', field: 'date' });

    const propertyId = v.optionalString(src, 'propertyId', 60) ?? defaults.propertyId ?? null;
    let unitId = v.optionalString(src, 'unitId', 60) ?? defaults.unitId ?? null;
    let ownership: 'OWNED' | 'MANAGED' = 'OWNED';
    if (propertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: propertyId, companyId: auth.companyId, deletedAt: null },
        select: { id: true, ownership: true },
      });
      if (!property || (auth.propertyIds && !auth.propertyIds.includes(property.id))) {
        throw new NotFoundException({ message: 'common.notFound', field: 'propertyId' });
      }
      ownership = property.ownership;
      if (unitId) {
        const unit = await this.prisma.unit.findFirst({ where: { id: unitId, propertyId, deletedAt: null }, select: { id: true } });
        if (!unit) unitId = null;
      }
    } else {
      // company overhead: only someone not limited to some properties may record it
      if (auth.propertyIds) throw new BadRequestException({ message: 'expense.propertyRequired', field: 'propertyId' });
      unitId = null;
    }

    const categoryId = v.optionalString(src, 'categoryId', 60) ?? defaults.categoryId;
    if (!categoryId) throw new BadRequestException({ message: 'validation.required', field: 'categoryId' });
    await this.findCategory(auth, categoryId);

    const vendorId = v.optionalString(src, 'vendorId', 60) ?? defaults.vendorId ?? null;
    if (vendorId) {
      const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, companyId: auth.companyId }, select: { id: true } });
      if (!vendor) throw new NotFoundException({ message: 'common.notFound', field: 'vendorId' });
    }

    const bearer = v.optionalEnum(src, 'bearer', BEARERS) ?? defaults.bearer ?? (propertyId ? defaultBearer(ownership) : 'COMPANY');
    if (!propertyId && bearer !== 'COMPANY') throw new BadRequestException({ message: 'expense.bearerNeedsProperty', field: 'bearer' });
    if (bearer === 'TENANT' && !unitId) throw new BadRequestException({ message: 'expense.tenantNeedsUnit', field: 'unitId' });
    if (bearer === 'OWNER' && ownership !== 'MANAGED') throw new BadRequestException({ message: 'expense.ownerNeedsManaged', field: 'bearer' });

    return {
      date,
      amount,
      categoryId,
      propertyId,
      unitId,
      vendorId,
      bearer,
      paidFrom: v.oneOf(src, 'paidFrom', PAID_FROM, defaults.paidFrom ?? 'CASH'),
      description: v.optionalString(src, 'description', 500) ?? defaults.description ?? '',
      invoiceNo: v.optionalString(src, 'invoiceNo', 60) ?? null,
      workOrderId: defaults.workOrderId ?? null,
    };
  }

  async create(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const data = await this.parse(auth, src);
    if (!data.description) throw new BadRequestException({ message: 'validation.required', field: 'description' });
    data.custom = await this.fields.apply('expense', src, null);
    const expense = await this.prisma.$transaction((tx) => this.createInTx(tx, auth, data));
    await this.activity.log(auth, { action: 'expense.create', entity: 'Expense', entityId: expense.id, details: { number: expense.number, amount: data.amount } });
    return this.get(auth, expense.id);
  }

  /** Records and posts an expense inside the caller's transaction (used by work orders too). */
  async createInTx(tx: Tx, auth: UserAuth, data: ExpenseInput) {
    // a cost borne by the tenant goes to the unit's lease that covers the expense date (or the latest active one)
    let lease: { id: string; tenantId: string } | null = null;
    if (data.bearer === 'TENANT') {
      lease =
        (await tx.lease.findFirst({
          where: { unitId: data.unitId!, deletedAt: null, status: { not: 'DRAFT' }, startDate: { lte: data.date }, endDate: { gte: data.date } },
          select: { id: true, tenantId: true },
        })) ??
        (await tx.lease.findFirst({ where: { unitId: data.unitId!, deletedAt: null, status: 'ACTIVE' }, orderBy: { startDate: 'desc' }, select: { id: true, tenantId: true } }));
      if (!lease) throw new BadRequestException({ message: 'expense.noLeaseForTenant', field: 'bearer' });
    }

    const number = await this.ledger.nextNumber(tx, auth.companyId, 'expense', data.date.getUTCFullYear(), 'EX', 6);
    const dims = { propertyId: data.propertyId, unitId: data.unitId };
    const entry = await this.ledger.post(tx, {
      companyId: auth.companyId,
      date: data.date,
      type: 'EXPENSE',
      memo: `${number} — ${data.description}`,
      createdById: auth.userId,
      lines: expenseLines(data.paidFrom, data.amount, dims),
    });

    let rechargeChargeId: string | null = null;
    if (lease) {
      const last = await tx.rentCharge.findFirst({ where: { leaseId: lease.id, kind: 'FEE' }, orderBy: { index: 'desc' }, select: { index: true } });
      const charge = await tx.rentCharge.create({
        data: {
          companyId: auth.companyId,
          leaseId: lease.id,
          propertyId: data.propertyId!,
          unitId: data.unitId!,
          tenantId: lease.tenantId,
          kind: 'FEE',
          index: (last?.index ?? 0) + 1,
          dueDate: data.date,
          amount: data.amount,
          status: 'POSTED',
        },
      });
      const fee = await this.ledger.post(tx, {
        companyId: auth.companyId,
        date: data.date,
        type: 'FEE_CHARGE',
        memo: `${number} — ${data.description}`,
        leaseId: lease.id,
        chargeId: charge.id,
        createdById: auth.userId,
        lines: chargeLines('FEE', data.amount, { ...dims, leaseId: lease.id, tenantId: lease.tenantId }),
      });
      await tx.rentCharge.update({ where: { id: charge.id }, data: { entryId: fee.id } });
      rechargeChargeId = charge.id;
    }

    return tx.expense.create({
      data: {
        companyId: auth.companyId,
        number,
        date: data.date,
        amount: data.amount,
        categoryId: data.categoryId,
        propertyId: data.propertyId,
        unitId: data.unitId,
        leaseId: lease?.id ?? null,
        vendorId: data.vendorId,
        bearer: data.bearer,
        paidFrom: data.paidFrom,
        description: data.description,
        invoiceNo: data.invoiceNo,
        entryId: entry.id,
        rechargeChargeId,
        workOrderId: data.workOrderId ?? null,
        ...(data.custom !== undefined ? { custom: data.custom } : {}),
        createdById: auth.userId,
      },
    });
  }

  /** Void (إلغاء): reversing entries for the expense and, if any, the amount charged to the tenant. */
  async void(auth: UserAuth, id: string, input: unknown) {
    const reason = v.requiredString(v.body(input ?? {}), 'reason', 500);
    const expense = await this.get(auth, id);
    if (expense.status !== 'POSTED' || !expense.entryId) throw new BadRequestException('expense.alreadyVoided');
    const date = today();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.expense.updateMany({ where: { id, status: 'POSTED' }, data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason } });
      if (claimed.count === 0) throw new BadRequestException('expense.alreadyVoided');
      await this.ledger.reverse(tx, auth.companyId, expense.entryId!, { date, memo: `${expense.number} — void: ${reason}`, createdById: auth.userId });
      if (expense.rechargeChargeId) {
        const charge = await tx.rentCharge.findUnique({ where: { id: expense.rechargeChargeId } });
        if (charge?.entryId && charge.status === 'POSTED') {
          await this.ledger.reverse(tx, auth.companyId, charge.entryId, { date, memo: `${expense.number} — void: ${reason}`, createdById: auth.userId });
          await tx.rentCharge.update({ where: { id: charge.id }, data: { status: 'CANCELLED' } });
        }
      }
    });
    await this.activity.log(auth, { action: 'expense.void', entity: 'Expense', entityId: id, details: { number: expense.number, reason } });
    return this.get(auth, id);
  }

  /** Default category for work orders (the maintenance one, else the first active). */
  async maintenanceCategoryId(companyId: string) {
    await this.ensureCategories(companyId);
    const cat =
      (await this.prisma.expenseCategory.findFirst({ where: { companyId, isMaintenance: true, isActive: true } })) ??
      (await this.prisma.expenseCategory.findFirst({ where: { companyId, isActive: true }, orderBy: { sortOrder: 'asc' } }));
    return cat?.id ?? null;
  }

  /** Item used for municipality fees: the system one, else one named like it, else creates it. */
  async municipalityCategoryId(companyId: string) {
    await this.ensureCategories(companyId);
    const found =
      (await this.prisma.expenseCategory.findFirst({ where: { companyId, systemKey: 'municipality' } })) ??
      (await this.prisma.expenseCategory.findFirst({ where: { companyId, nameEn: 'Municipality & government fees' } }));
    if (found) return found.id;
    const def = DEFAULT_CATEGORIES.find((c) => c.systemKey === 'municipality')!;
    const created = await this.prisma.expenseCategory.create({ data: { companyId, nameAr: def.nameAr, nameEn: def.nameEn, systemKey: 'municipality', sortOrder: 99 } });
    return created.id;
  }

  // ---------------------------------------------------------------- helpers

  private async ensureCategories(companyId: string) {
    const count = await this.prisma.expenseCategory.count({ where: { companyId } });
    if (count > 0) return;
    await this.prisma.expenseCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c, i) => ({ companyId, nameAr: c.nameAr, nameEn: c.nameEn, isMaintenance: c.isMaintenance ?? false, systemKey: c.systemKey ?? null, sortOrder: i + 1 })),
    });
  }

  private async findCategory(auth: UserAuth, id: string, includeInactive = false) {
    const cat = await this.prisma.expenseCategory.findFirst({ where: { id, companyId: auth.companyId, ...(includeInactive ? {} : { isActive: true }) } });
    if (!cat) throw new NotFoundException({ message: 'common.notFound', field: 'categoryId' });
    return cat;
  }

  private scope(auth: UserAuth): Prisma.ExpenseWhereInput {
    return auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {};
  }
}
