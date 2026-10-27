import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Lease, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { propertyScope } from '../properties/properties.service.js';
import type { UserAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';
import { today } from '../common/dates.js';
import { buildSchedule, scheduleTotal, type Frequency } from './schedule.js';
import { ChargesService } from '../finance/charges.service.js';
import { FieldsService } from '../fields/fields.module.js';

export const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'] as const;
export const RENEWAL_STATUSES = ['PENDING', 'RENEW', 'NOT_RENEW', 'NEGOTIATING'] as const;
const OPEN: Lease['status'][] = ['DRAFT', 'ACTIVE'];
const DAY = 86_400_000;

const todayUtc = () => today(); // calendar date in Oman

const INCLUDE = {
  tenant: { select: { id: true, name: true, phone: true, civilId: true } },
  unit: { select: { id: true, number: true, floor: true, type: true, status: true } },
  property: { select: { id: true, name: true, wilayat: true } },
} as const;

/**
 * Leases (العقود): link a tenant to a unit for a period and a rent.
 * Lifecycle: DRAFT → ACTIVE → ENDED / TERMINATED / RENEWED. A unit can only have one open lease per period.
 * Unit status follows the lease: active now → OCCUPIED, starts later → RESERVED, finished → VACANT.
 */
@Injectable()
export class LeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly charges: ChargesService,
    private readonly fields: FieldsService,
  ) {}

  /** filter: active | expiring | draft | ended | all */
  async list(auth: UserAuth, query: { filter?: string; tenantId?: string; unitId?: string; propertyId?: string; days?: string }) {
    await this.syncEnded(auth);
    const where: Prisma.LeaseWhereInput = { companyId: auth.companyId, deletedAt: null, property: propertyScope(auth) };
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.unitId) where.unitId = query.unitId;
    if (query.propertyId) where.propertyId = query.propertyId;
    const days = Math.min(Math.max(Number(query.days) || 90, 1), 365);
    switch (query.filter) {
      case 'active':
        where.status = 'ACTIVE';
        break;
      case 'expiring':
        where.status = 'ACTIVE';
        where.endDate = { lte: new Date(todayUtc().getTime() + days * DAY) };
        break;
      case 'draft':
        where.status = 'DRAFT';
        break;
      case 'ended':
        where.status = { in: ['ENDED', 'TERMINATED', 'RENEWED'] };
        break;
      default:
        break;
    }
    return this.prisma.lease.findMany({
      where,
      include: INCLUDE,
      orderBy: query.filter === 'expiring' ? { endDate: 'asc' } : { startDate: 'desc' },
    });
  }

  /** Draft: the computed schedule. Otherwise: the saved charges with their status (scheduled / due / cancelled). */
  async get(auth: UserAuth, id: string) {
    const lease = await this.find(auth, id);
    if (lease.status !== 'DRAFT') {
      await this.charges.sync(auth.companyId);
      const charges = await this.prisma.rentCharge.findMany({
        where: { leaseId: id },
        orderBy: [{ kind: 'asc' }, { index: 'asc' }],
        select: { id: true, kind: true, index: true, periodStart: true, periodEnd: true, dueDate: true, amount: true, status: true },
      });
      const rent = charges.filter((c) => c.kind === 'RENT');
      const schedule = rent.map((c) => ({
        index: c.index,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        dueDate: c.dueDate,
        amount: c.amount,
        partial: false,
        status: c.status,
      }));
      const total = rent.filter((c) => c.status !== 'CANCELLED').reduce((sum, c) => sum + c.amount, 0);
      const municipality = await this.prisma.municipalityRecord.findMany({ where: { leaseId: id }, orderBy: { registeredAt: 'desc' } });
      return { ...lease, schedule, total, depositCharge: charges.find((c) => c.kind === 'DEPOSIT') ?? null, municipality };
    }
    const schedule = buildSchedule({ ...lease, paymentFrequency: lease.paymentFrequency as Frequency });
    return { ...lease, schedule, total: scheduleTotal(schedule) };
  }

  /** Preview the schedule before saving (used by the form). */
  preview(input: unknown) {
    const src = v.body(input);
    const data = this.money(src, true);
    const dates = this.dates(src, true);
    const schedule = buildSchedule({
      startDate: dates.startDate!,
      endDate: dates.endDate!,
      monthlyRent: data.monthlyRent!,
      discount: data.discount ?? 0,
      paymentFrequency: v.oneOf(src, 'paymentFrequency', FREQUENCIES, 'MONTHLY'),
      dueDay: v.optionalInt(src, 'dueDay', 1, 28) ?? 1,
    });
    return { schedule, total: scheduleTotal(schedule) };
  }

  async create(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const unit = await this.findUnit(auth, v.requiredString(src, 'unitId', 60));
    const tenantId = v.requiredString(src, 'tenantId', 60);
    await this.findTenant(auth, tenantId);
    const { startDate, endDate } = this.dates(src, true) as { startDate: Date; endDate: Date };
    await this.assertUnitFree(unit.id, startDate, endDate);
    const renewedFromId = v.optionalString(src, 'renewedFromId', 60);
    if (renewedFromId) await this.find(auth, renewedFromId);
    const custom = await this.fields.apply('lease', src, null);

    const lease = await this.prisma.lease.create({
      data: {
        companyId: auth.companyId,
        number: await this.nextNumber(auth.companyId, startDate),
        propertyId: unit.propertyId,
        unitId: unit.id,
        tenantId,
        startDate,
        endDate,
        ...(this.money(src, true) as { monthlyRent: number }),
        ...this.terms(src),
        renewedFromId: renewedFromId ?? null,
        ...(custom !== undefined ? { custom } : {}),
        status: 'DRAFT',
        createdById: auth.userId,
      },
      include: INCLUDE,
    });
    await this.activity.log(auth, { action: 'lease.create', entity: 'Lease', entityId: lease.id, details: { number: lease.number } });
    if (src.activate === true) return this.activate(auth, lease.id);
    return lease;
  }

  /** Draft: everything editable. Active: terms and notes only (unit, tenant and rent change via renewal). */
  async update(auth: UserAuth, id: string, input: unknown) {
    const lease = await this.find(auth, id);
    const src = v.body(input);
    let data: Prisma.LeaseUncheckedUpdateInput;
    if (lease.status === 'DRAFT') {
      const dates = this.dates(src, false);
      const startDate = dates.startDate ?? lease.startDate;
      const endDate = dates.endDate ?? lease.endDate;
      if (endDate < startDate) throw new BadRequestException({ message: 'validation.endBeforeStart', field: 'endDate' });
      let unitId = lease.unitId;
      let propertyId = lease.propertyId;
      if (src.unitId !== undefined) {
        const unit = await this.findUnit(auth, v.requiredString(src, 'unitId', 60));
        unitId = unit.id;
        propertyId = unit.propertyId;
      }
      if (src.tenantId !== undefined) await this.findTenant(auth, v.requiredString(src, 'tenantId', 60));
      await this.assertUnitFree(unitId, startDate, endDate, id);
      data = {
        unitId,
        propertyId,
        tenantId: src.tenantId !== undefined ? String(src.tenantId) : undefined,
        startDate,
        endDate,
        ...this.money(src, false),
        ...this.terms(src),
      };
    } else if (lease.status === 'ACTIVE') {
      data = { ...this.terms(src) };
      delete data.paymentFrequency;
      delete data.dueDay;
    } else {
      throw new BadRequestException('lease.closed');
    }
    const custom = await this.fields.apply('lease', src, lease);
    if (custom !== undefined) data.custom = custom;
    const updated = await this.prisma.lease.update({ where: { id }, data, include: INCLUDE });
    await this.activity.log(auth, { action: 'lease.update', entity: 'Lease', entityId: id, details: data });
    return updated;
  }

  async activate(auth: UserAuth, id: string) {
    const lease = await this.find(auth, id);
    if (lease.status !== 'DRAFT') throw new BadRequestException('lease.notDraft');
    await this.assertUnitFree(lease.unitId, lease.startDate, lease.endDate, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.lease.update({ where: { id }, data: { status: 'ACTIVE' } });
      if (lease.renewedFromId) {
        await tx.lease.updateMany({ where: { id: lease.renewedFromId, status: 'ACTIVE' }, data: { status: 'RENEWED', renewalStatus: 'RENEW' } });
      }
      // the schedule becomes the lease's charges; those already due are posted right after
      await this.charges.createForLease(tx, lease);
    });
    await this.charges.sync(auth.companyId);
    await this.refreshUnitStatus(lease.unitId);
    await this.activity.log(auth, { action: 'lease.activate', entity: 'Lease', entityId: id });
    return this.get(auth, id);
  }

  /** End early (إنهاء مبكر). The unit becomes vacant from the termination date. */
  async terminate(auth: UserAuth, id: string, input: unknown) {
    const lease = await this.find(auth, id);
    if (lease.status !== 'ACTIVE') throw new BadRequestException('lease.notActive');
    const src = v.body(input ?? {});
    const terminatedAt = v.optionalDate(src, 'date') ?? todayUtc();
    if (terminatedAt < lease.startDate) throw new BadRequestException({ message: 'validation.endBeforeStart', field: 'date' });
    if (terminatedAt > lease.endDate) throw new BadRequestException({ message: 'lease.terminateAfterEnd', field: 'date' });
    await this.charges.sync(auth.companyId); // make sure the schedule exists before cutting it
    const cut = await this.prisma.$transaction(async (tx) => {
      await tx.lease.update({
        where: { id },
        data: { status: 'TERMINATED', terminatedAt, terminationReason: v.optionalString(src, 'reason', 500) ?? null },
      });
      // later periods cancelled, the current one prorated — reversing entries for anything already posted
      return this.charges.cutForTermination(tx, lease, terminatedAt, auth.userId);
    });
    await this.refreshUnitStatus(lease.unitId, terminatedAt);
    await this.activity.log(auth, { action: 'lease.terminate', entity: 'Lease', entityId: id, details: { terminatedAt, ...cut } });
    return this.get(auth, id);
  }

  /** Prepare a renewal: a new DRAFT lease starting the day after this one ends (rent can change). */
  async renew(auth: UserAuth, id: string, input: unknown) {
    const lease = await this.find(auth, id);
    if (lease.status !== 'ACTIVE' && lease.status !== 'ENDED') throw new BadRequestException('lease.notActive');
    const existing = await this.prisma.lease.findFirst({ where: { renewedFromId: id, deletedAt: null, status: { in: OPEN } } });
    if (existing) throw new ConflictException({ message: 'lease.renewalExists', leaseId: existing.id });
    const src = v.body(input ?? {});
    const startDate = new Date(lease.endDate.getTime() + DAY);
    const months = v.optionalInt(src, 'months', 1, 120) ?? 12;
    const end = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months, startDate.getUTCDate()));
    const endDate = new Date(end.getTime() - DAY);
    return this.create(auth, {
      unitId: lease.unitId,
      tenantId: lease.tenantId,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      monthlyRent: v.optionalBaisa(src, 'monthlyRent') ?? lease.monthlyRent,
      discount: lease.discount,
      paymentFrequency: lease.paymentFrequency,
      dueDay: lease.dueDay,
      deposit: lease.deposit,
      renewedFromId: id,
      // carry over what the form would need, so fields made required by the platform team do not block a renewal
      municipalityNo: lease.municipalityNo,
      notes: lease.notes,
      custom: lease.custom,
    });
  }

  /** Only drafts are deleted (to the trash). Active leases are terminated instead. */
  async remove(auth: UserAuth, id: string) {
    const lease = await this.find(auth, id);
    if (lease.status !== 'DRAFT') throw new BadRequestException('lease.onlyDraftDelete');
    await this.prisma.lease.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'lease.delete', entity: 'Lease', entityId: id });
    return { ok: true };
  }

  /** Dashboard numbers (leases are part of the tenants section). */
  async stats(auth: UserAuth) {
    await this.syncEnded(auth);
    const base = { companyId: auth.companyId, deletedAt: null, status: 'ACTIVE' as const, property: propertyScope(auth) };
    const t = todayUtc().getTime();
    const [active, in30, in60, in90] = await Promise.all([
      this.prisma.lease.count({ where: base }),
      this.prisma.lease.count({ where: { ...base, endDate: { lte: new Date(t + 30 * DAY) } } }),
      this.prisma.lease.count({ where: { ...base, endDate: { lte: new Date(t + 60 * DAY) } } }),
      this.prisma.lease.count({ where: { ...base, endDate: { lte: new Date(t + 90 * DAY) } } }),
    ]);
    return { active, expiring30: in30, expiring60: in60, expiring90: in90 };
  }

  // ---------------------------------------------------------------- helpers

  /** Active leases whose end date has passed become ENDED (and their units vacant). Cheap, run on reads. */
  private async syncEnded(auth: UserAuth) {
    const due = await this.prisma.lease.findMany({
      where: { companyId: auth.companyId, status: 'ACTIVE', endDate: { lt: todayUtc() } },
      select: { id: true, unitId: true, endDate: true },
    });
    for (const l of due) {
      await this.prisma.lease.update({ where: { id: l.id }, data: { status: 'ENDED' } });
      await this.refreshUnitStatus(l.unitId, new Date(l.endDate.getTime() + DAY));
    }
  }

  /** Unit status from its leases: active now → OCCUPIED, active later → RESERVED, none → VACANT. Maintenance is kept. */
  private async refreshUnitStatus(unitId: string, vacantFrom?: Date) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) return;
    const today = todayUtc();
    const active = await this.prisma.lease.findMany({ where: { unitId, status: 'ACTIVE', deletedAt: null }, select: { startDate: true, endDate: true } });
    const current = active.some((l) => l.startDate <= today && l.endDate >= today);
    const future = active.some((l) => l.startDate > today);
    let status = unit.status;
    if (current) status = 'OCCUPIED';
    else if (future) status = 'RESERVED';
    else if (unit.status !== 'MAINTENANCE') status = 'VACANT';
    if (status !== unit.status) {
      await this.prisma.unit.update({
        where: { id: unitId },
        data: { status, vacantSince: status === 'VACANT' ? (vacantFrom ?? today) : null },
      });
    }
  }

  private async assertUnitFree(unitId: string, startDate: Date, endDate: Date, exceptId?: string) {
    const clash = await this.prisma.lease.findFirst({
      where: {
        unitId,
        deletedAt: null,
        status: { in: OPEN },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { number: true },
    });
    if (clash) throw new ConflictException({ message: 'lease.unitBusy', field: 'unitId', number: clash.number });
  }

  private async nextNumber(companyId: string, startDate: Date) {
    const year = startDate.getUTCFullYear();
    const prefix = `L-${year}-`;
    const last = await this.prisma.lease.findFirst({
      where: { companyId, number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  private async find(auth: UserAuth, id: string) {
    const lease = await this.prisma.lease.findFirst({
      where: { id, companyId: auth.companyId, deletedAt: null, property: propertyScope(auth) },
      include: INCLUDE,
    });
    if (!lease) throw new NotFoundException('common.notFound');
    return lease;
  }

  private async findUnit(auth: UserAuth, id: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id, companyId: auth.companyId, deletedAt: null, property: propertyScope(auth) } });
    if (!unit) throw new NotFoundException({ message: 'lease.unitNotFound', field: 'unitId' });
    return unit;
  }

  private async findTenant(auth: UserAuth, id: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, companyId: auth.companyId, deletedAt: null } });
    if (!tenant) throw new NotFoundException({ message: 'lease.tenantNotFound', field: 'tenantId' });
    return tenant;
  }

  private dates(src: Record<string, unknown>, required: boolean) {
    const startDate = required ? v.requiredDate(src, 'startDate') : (v.optionalDate(src, 'startDate') ?? undefined);
    const endDate = required ? v.requiredDate(src, 'endDate') : (v.optionalDate(src, 'endDate') ?? undefined);
    if (startDate && endDate && endDate < startDate) throw new BadRequestException({ message: 'validation.endBeforeStart', field: 'endDate' });
    return { startDate, endDate };
  }

  private money(src: Record<string, unknown>, required: boolean) {
    const out: { monthlyRent?: number; discount?: number; deposit?: number } = {};
    if (required || src.monthlyRent !== undefined) {
      const rent = v.optionalBaisa(src, 'monthlyRent');
      if (!rent) throw new BadRequestException({ message: 'validation.required', field: 'monthlyRent' });
      out.monthlyRent = rent;
    }
    if (src.discount !== undefined) out.discount = v.optionalBaisa(src, 'discount') ?? 0;
    if (src.deposit !== undefined) out.deposit = v.optionalBaisa(src, 'deposit') ?? 0;
    if (out.discount && out.monthlyRent && out.discount >= out.monthlyRent) {
      throw new BadRequestException({ message: 'lease.discountTooHigh', field: 'discount' });
    }
    return out;
  }

  private terms(src: Record<string, unknown>) {
    const data: {
      paymentFrequency?: Frequency;
      dueDay?: number;
      renewalStatus?: (typeof RENEWAL_STATUSES)[number];
      municipalityNo?: string | null;
      municipalityFee?: number | null;
      notes?: string | null;
    } = {};
    if (src.paymentFrequency !== undefined) data.paymentFrequency = v.oneOf(src, 'paymentFrequency', FREQUENCIES);
    if (src.dueDay !== undefined) data.dueDay = v.optionalInt(src, 'dueDay', 1, 28) ?? 1;
    if (src.renewalStatus !== undefined) data.renewalStatus = v.oneOf(src, 'renewalStatus', RENEWAL_STATUSES);
    data.municipalityNo = v.nullableString(src, 'municipalityNo', 40);
    data.municipalityFee = v.optionalBaisa(src, 'municipalityFee');
    data.notes = v.nullableString(src, 'notes', 2000);
    return data;
  }
}
