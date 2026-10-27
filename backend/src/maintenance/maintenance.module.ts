import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import type { Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';
import { today } from '../common/dates.js';
import * as v from '../common/validate.js';
import { FinanceCoreModule } from '../finance/finance.module.js';
import { BEARERS, ExpensesService } from '../finance/expenses.service.js';
import { defaultBearer } from '../finance/journal.js';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const MAX_INT = 2_147_483_647;

const INCLUDE = {
  property: { select: { id: true, name: true, ownership: true } },
  unit: { select: { id: true, number: true } },
  vendor: { select: { id: true, name: true, phone: true } },
  expense: { select: { id: true, number: true, amount: true, status: true } },
} as const;

// ==================================================================== vendors

/** Contractors and suppliers (المقاولون والموردون). */
@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  list(auth: UserAuth) {
    return this.prisma.vendor.findMany({ where: { companyId: auth.companyId, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async save(auth: UserAuth, id: string | null, input: unknown) {
    const src = v.body(input);
    const data: Prisma.VendorUncheckedUpdateInput = {};
    if (!id || src.name !== undefined) data.name = v.requiredString(src, 'name', 120);
    data.phone = v.nullableString(src, 'phone', 30);
    data.email = v.nullableString(src, 'email', 120);
    data.specialty = v.nullableString(src, 'specialty', 80);
    data.notes = v.nullableString(src, 'notes', 1000);
    if (id) {
      await this.find(auth, id);
      const vendor = await this.prisma.vendor.update({ where: { id }, data });
      await this.activity.log(auth, { action: 'vendor.update', entity: 'Vendor', entityId: id, details: data });
      return vendor;
    }
    const vendor = await this.prisma.vendor.create({ data: { ...(data as Prisma.VendorUncheckedCreateInput), companyId: auth.companyId } });
    await this.activity.log(auth, { action: 'vendor.create', entity: 'Vendor', entityId: vendor.id, details: data });
    return vendor;
  }

  async remove(auth: UserAuth, id: string) {
    await this.find(auth, id);
    await this.prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'vendor.delete', entity: 'Vendor', entityId: id });
    return { ok: true };
  }

  private async find(auth: UserAuth, id: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id, companyId: auth.companyId, deletedAt: null } });
    if (!vendor) throw new NotFoundException('common.notFound');
    return vendor;
  }
}

// ==================================================================== work orders

/**
 * Maintenance work orders (أوامر الصيانة): OPEN → IN_PROGRESS → DONE (or CANCELLED).
 * Completing with a cost records the expense (with its bearer) in the same transaction.
 */
@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly expenses: ExpensesService,
  ) {}

  /** filter: open (open + in progress) | done | cancelled | all */
  async list(auth: UserAuth, query: { filter?: string; propertyId?: string }) {
    const where: Prisma.WorkOrderWhereInput = { companyId: auth.companyId, ...this.scope(auth) };
    if (query.propertyId) where.propertyId = query.propertyId;
    const statusOf: Record<string, WorkOrderStatus[]> = { open: ['OPEN', 'IN_PROGRESS'], done: ['DONE'], cancelled: ['CANCELLED'] };
    if (query.filter && statusOf[query.filter]) where.status = { in: statusOf[query.filter] };
    const rows = await this.prisma.workOrder.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' }, take: 300 });
    const rank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    // open work first, most urgent first
    return rows.sort((a, b) => {
      const openA = a.status === 'OPEN' || a.status === 'IN_PROGRESS' ? 0 : 1;
      const openB = b.status === 'OPEN' || b.status === 'IN_PROGRESS' ? 0 : 1;
      return openA - openB || (openA === 0 ? rank[a.priority] - rank[b.priority] : 0);
    });
  }

  async stats(auth: UserAuth) {
    const base = { companyId: auth.companyId, ...this.scope(auth) };
    const [open, urgent, inProgress] = await Promise.all([
      this.prisma.workOrder.count({ where: { ...base, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.workOrder.count({ where: { ...base, status: { in: ['OPEN', 'IN_PROGRESS'] }, priority: 'URGENT' } }),
      this.prisma.workOrder.count({ where: { ...base, status: 'IN_PROGRESS' } }),
    ]);
    return { open, urgent, inProgress };
  }

  async get(auth: UserAuth, id: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, companyId: auth.companyId, ...this.scope(auth) }, include: INCLUDE });
    if (!wo) throw new NotFoundException('common.notFound');
    return wo;
  }

  async create(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const property = await this.findProperty(auth, v.requiredString(src, 'propertyId', 60));
    const data = await this.fields(auth, src, property.id, true);
    const year = today().getUTCFullYear();
    const wo = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_key: { companyId: auth.companyId, key: `workorder:${year}` } },
        create: { companyId: auth.companyId, key: `workorder:${year}`, value: 1 },
        update: { value: { increment: 1 } },
      });
      return tx.workOrder.create({
        data: {
          ...(data as Prisma.WorkOrderUncheckedCreateInput),
          companyId: auth.companyId,
          number: `WO-${year}-${String(counter.value).padStart(4, '0')}`,
          propertyId: property.id,
          bearer: (data.bearer as (typeof BEARERS)[number] | undefined) ?? defaultBearer(property.ownership),
          createdById: auth.userId,
        },
      });
    });
    await this.activity.log(auth, { action: 'workOrder.create', entity: 'WorkOrder', entityId: wo.id, details: { number: wo.number } });
    return this.get(auth, wo.id);
  }

  async update(auth: UserAuth, id: string, input: unknown) {
    const wo = await this.get(auth, id);
    if (wo.status === 'DONE' || wo.status === 'CANCELLED') throw new BadRequestException('workOrder.closed');
    const data = await this.fields(auth, v.body(input), wo.propertyId, false);
    await this.prisma.workOrder.update({ where: { id }, data });
    await this.activity.log(auth, { action: 'workOrder.update', entity: 'WorkOrder', entityId: id, details: data });
    return this.get(auth, id);
  }

  async start(auth: UserAuth, id: string) {
    const wo = await this.get(auth, id);
    if (wo.status !== 'OPEN') throw new BadRequestException('workOrder.wrongStatus');
    await this.prisma.workOrder.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
    await this.activity.log(auth, { action: 'workOrder.start', entity: 'WorkOrder', entityId: id });
    return this.get(auth, id);
  }

  /** Done (إغلاق): with a cost → the expense is recorded and posted in the same step. */
  async complete(auth: UserAuth, id: string, input: unknown) {
    const wo = await this.get(auth, id);
    if (wo.status !== 'OPEN' && wo.status !== 'IN_PROGRESS') throw new BadRequestException('workOrder.wrongStatus');
    const src = v.body(input ?? {});
    const cost = v.optionalBaisa(src, 'amount') ?? 0;
    const expenseInput =
      cost > 0
        ? await this.expenses.parse(auth, src, {
            propertyId: wo.propertyId,
            unitId: wo.unitId,
            vendorId: wo.vendorId,
            bearer: wo.bearer,
            categoryId: (await this.expenses.maintenanceCategoryId(auth.companyId)) ?? undefined,
            description: `${wo.number} — ${wo.title}`,
            workOrderId: wo.id,
          })
        : null;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.workOrder.updateMany({
        where: { id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        data: { status: 'DONE', completedAt: expenseInput?.date ?? today() },
      });
      if (claimed.count === 0) throw new BadRequestException('workOrder.wrongStatus');
      if (expenseInput) await this.expenses.createInTx(tx, auth, { ...expenseInput, propertyId: wo.propertyId, workOrderId: wo.id });
    });
    await this.activity.log(auth, { action: 'workOrder.complete', entity: 'WorkOrder', entityId: id, details: { cost } });
    return this.get(auth, id);
  }

  async cancel(auth: UserAuth, id: string, input: unknown) {
    const wo = await this.get(auth, id);
    if (wo.status === 'DONE' || wo.status === 'CANCELLED') throw new BadRequestException('workOrder.wrongStatus');
    const reason = v.requiredString(v.body(input ?? {}), 'reason', 300);
    await this.prisma.workOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
    await this.activity.log(auth, { action: 'workOrder.cancel', entity: 'WorkOrder', entityId: id, details: { reason } });
    return this.get(auth, id);
  }

  // ---------------------------------------------------------------- helpers

  private async fields(auth: UserAuth, src: Record<string, unknown>, propertyId: string, creating: boolean) {
    const data: Prisma.WorkOrderUncheckedUpdateInput = {};
    if (creating || src.title !== undefined) data.title = v.requiredString(src, 'title', 160);
    if (src.description !== undefined) data.description = v.optionalString(src, 'description', 2000) ?? null;
    if (src.priority !== undefined) data.priority = v.oneOf(src, 'priority', PRIORITIES);
    if (src.bearer !== undefined) data.bearer = v.oneOf(src, 'bearer', BEARERS);
    if (src.reportedBy !== undefined) data.reportedBy = v.optionalString(src, 'reportedBy', 120) ?? null;
    if (src.notes !== undefined) data.notes = v.optionalString(src, 'notes', 2000) ?? null;
    if (src.scheduledDate !== undefined) data.scheduledDate = v.optionalDate(src, 'scheduledDate') ?? null;
    if (src.estimatedCost !== undefined) {
      const cost = v.optionalBaisa(src, 'estimatedCost') ?? null;
      if (cost !== null && cost > MAX_INT) throw new BadRequestException({ message: 'validation.invalid', field: 'estimatedCost' });
      data.estimatedCost = cost;
    }
    if (src.unitId !== undefined) {
      const unitId = v.optionalString(src, 'unitId', 60) ?? null;
      if (unitId) {
        const unit = await this.prisma.unit.findFirst({ where: { id: unitId, propertyId, deletedAt: null }, select: { id: true } });
        if (!unit) throw new NotFoundException({ message: 'common.notFound', field: 'unitId' });
      }
      data.unitId = unitId;
    }
    if (src.vendorId !== undefined) {
      const vendorId = v.optionalString(src, 'vendorId', 60) ?? null;
      if (vendorId) {
        const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, companyId: auth.companyId, deletedAt: null }, select: { id: true } });
        if (!vendor) throw new NotFoundException({ message: 'common.notFound', field: 'vendorId' });
      }
      data.vendorId = vendorId;
    }
    if (data.bearer === 'TENANT' && !(data.unitId ?? null) && creating) {
      throw new BadRequestException({ message: 'expense.tenantNeedsUnit', field: 'unitId' });
    }
    return data;
  }

  private async findProperty(auth: UserAuth, id: string) {
    const property = await this.prisma.property.findFirst({ where: { id, companyId: auth.companyId, deletedAt: null }, select: { id: true, ownership: true } });
    if (!property || (auth.propertyIds && !auth.propertyIds.includes(property.id))) throw new NotFoundException({ message: 'common.notFound', field: 'propertyId' });
    return property;
  }

  private scope(auth: UserAuth): Prisma.WorkOrderWhereInput {
    return auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {};
  }
}

// ==================================================================== API

@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly vendors: VendorsService,
  ) {}

  @RequirePermission('maintenance', 'VIEW')
  @Get('work-orders')
  list(@Auth() auth: UserAuth, @Query('filter') filter?: string, @Query('propertyId') propertyId?: string) {
    return this.workOrders.list(auth, { filter, propertyId });
  }

  @RequirePermission('maintenance', 'VIEW')
  @Get('work-orders/stats')
  stats(@Auth() auth: UserAuth) {
    return this.workOrders.stats(auth);
  }

  @RequirePermission('maintenance', 'VIEW')
  @Get('work-orders/:id')
  get(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.workOrders.get(auth, id);
  }

  @RequirePermission('maintenance', 'EDIT')
  @Post('work-orders')
  create(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.workOrders.create(auth, body);
  }

  @RequirePermission('maintenance', 'EDIT')
  @Patch('work-orders/:id')
  update(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.workOrders.update(auth, id, body);
  }

  @RequirePermission('maintenance', 'EDIT')
  @Post('work-orders/:id/start')
  start(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.workOrders.start(auth, id);
  }

  @RequirePermission('maintenance', 'EDIT')
  @Post('work-orders/:id/complete')
  complete(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.workOrders.complete(auth, id, body);
  }

  @RequirePermission('maintenance', 'EDIT')
  @Post('work-orders/:id/cancel')
  cancel(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.workOrders.cancel(auth, id, body);
  }

  @RequirePermission('maintenance', 'VIEW')
  @Get('vendors')
  listVendors(@Auth() auth: UserAuth) {
    return this.vendors.list(auth);
  }

  @RequirePermission('maintenance', 'EDIT')
  @Post('vendors')
  createVendor(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.vendors.save(auth, null, body);
  }

  @RequirePermission('maintenance', 'EDIT')
  @Patch('vendors/:id')
  updateVendor(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.vendors.save(auth, id, body);
  }

  @RequirePermission('maintenance', 'EDIT')
  @Delete('vendors/:id')
  removeVendor(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.vendors.remove(auth, id);
  }
}

@Module({
  imports: [FinanceCoreModule],
  controllers: [MaintenanceController],
  providers: [WorkOrdersService, VendorsService],
  exports: [WorkOrdersService, VendorsService],
})
export class MaintenanceModule {}
