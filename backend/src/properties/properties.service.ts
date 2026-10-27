import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Unit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { PlansService } from '../plans/plans.service.js';
import type { UserAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';

export const OWNERSHIPS = ['OWNED', 'MANAGED'] as const;
export const CATEGORIES = ['BUILDING', 'VILLA_COMPOUND', 'VILLA', 'COMMERCIAL_COMPLEX', 'LAND', 'OTHER'] as const;
export const UNIT_TYPES = ['APARTMENT', 'STUDIO', 'VILLA', 'ROOM', 'SHOP', 'OFFICE', 'WAREHOUSE', 'OTHER'] as const;
export const UNIT_STATUSES = ['VACANT', 'OCCUPIED', 'MAINTENANCE', 'RESERVED'] as const;
const MAX_BULK = 300;

/** Properties the caller may see (company + role's property list). */
export function propertyScope(auth: UserAuth, deleted = false): Prisma.PropertyWhereInput {
  return {
    companyId: auth.companyId,
    deletedAt: deleted ? { not: null } : null,
    // inside AND so that callers adding `id` ({ ...propertyScope(auth), id }) cannot replace the restriction
    ...(auth.propertyIds ? { AND: [{ id: { in: auth.propertyIds } }] } : {}),
  };
}

type UnitStats = { total: number; occupied: number; vacant: number; maintenance: number; reserved: number };

function stats(units: Pick<Unit, 'status'>[]): UnitStats & { occupancyRate: number | null } {
  const s: UnitStats = { total: units.length, occupied: 0, vacant: 0, maintenance: 0, reserved: 0 };
  for (const u of units) {
    if (u.status === 'OCCUPIED') s.occupied += 1;
    else if (u.status === 'VACANT') s.vacant += 1;
    else if (u.status === 'MAINTENANCE') s.maintenance += 1;
    else s.reserved += 1;
  }
  return { ...s, occupancyRate: s.total ? s.occupied / s.total : null };
}

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly activity: ActivityService,
  ) {}

  // ---------------------------------------------------------------- properties

  async list(auth: UserAuth, trash = false) {
    const properties = await this.prisma.property.findMany({
      where: propertyScope(auth, trash),
      orderBy: { createdAt: 'desc' },
      include: { units: { where: { deletedAt: null }, select: { status: true } } },
    });
    return properties.map(({ units, ...p }) => ({ ...p, stats: stats(units) }));
  }

  async get(auth: UserAuth, id: string) {
    const property = await this.prisma.property.findFirst({
      where: { ...propertyScope(auth), id },
      include: {
        units: {
          where: { deletedAt: null },
          orderBy: [{ floor: 'asc' }, { number: 'asc' }],
          include: {
            leases: {
              where: { deletedAt: null, status: 'ACTIVE' },
              orderBy: { startDate: 'asc' },
              take: 1,
              select: { id: true, number: true, endDate: true, monthlyRent: true, tenant: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!property) throw new NotFoundException('common.notFound');
    return { ...property, stats: stats(property.units) };
  }

  async create(auth: UserAuth, input: unknown) {
    this.assertAllProperties(auth);
    const data = this.propertyData(v.body(input), true) as Prisma.PropertyUncheckedCreateInput;
    await this.plans.assertCanAdd(auth.companyId, 'properties');
    const property = await this.prisma.property.create({
      data: { ...data, companyId: auth.companyId, createdById: auth.userId },
    });
    await this.activity.log(auth, { action: 'property.create', entity: 'Property', entityId: property.id, details: data });
    return property;
  }

  async update(auth: UserAuth, id: string, input: unknown) {
    await this.findProperty(auth, id);
    const data = this.propertyData(v.body(input), false);
    const property = await this.prisma.property.update({ where: { id }, data });
    await this.activity.log(auth, { action: 'property.update', entity: 'Property', entityId: id, details: data });
    return property;
  }

  /** To the trash, with its units. Restorable. */
  async remove(auth: UserAuth, id: string) {
    await this.findProperty(auth, id);
    await this.prisma.property.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'property.delete', entity: 'Property', entityId: id });
    return { ok: true };
  }

  async restore(auth: UserAuth, id: string) {
    const property = await this.prisma.property.findFirst({ where: { ...propertyScope(auth, true), id } });
    if (!property) throw new NotFoundException('common.notFound');
    const units = await this.prisma.unit.count({ where: { propertyId: id, deletedAt: null } });
    await this.plans.assertCanAdd(auth.companyId, 'properties');
    if (units) await this.plans.assertCanAdd(auth.companyId, 'units', units);
    await this.prisma.property.update({ where: { id }, data: { deletedAt: null } });
    await this.activity.log(auth, { action: 'property.restore', entity: 'Property', entityId: id });
    return { ok: true };
  }

  // ---------------------------------------------------------------- units

  async units(auth: UserAuth, propertyId: string, trash = false) {
    await this.findProperty(auth, propertyId);
    return this.prisma.unit.findMany({
      where: { propertyId, deletedAt: trash ? { not: null } : null },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });
  }

  async createUnit(auth: UserAuth, propertyId: string, input: unknown) {
    await this.findProperty(auth, propertyId);
    const data = this.unitData(v.body(input), true) as Prisma.UnitUncheckedCreateInput;
    await this.assertNumbersFree(propertyId, [data.number]);
    await this.plans.assertCanAdd(auth.companyId, 'units');
    const unit = await this.prisma.unit.create({
      data: { ...data, propertyId, companyId: auth.companyId, vacantSince: data.status === 'VACANT' || !data.status ? new Date() : null },
    });
    await this.activity.log(auth, { action: 'unit.create', entity: 'Unit', entityId: unit.id, details: data });
    return unit;
  }

  /** Add many units at once, e.g. floor 1: 101 → 110. */
  async createUnitsBulk(auth: UserAuth, propertyId: string, input: unknown) {
    await this.findProperty(auth, propertyId);
    const src = v.body(input);
    const from = v.nonNegativeInt(src, 'from');
    const to = v.nonNegativeInt(src, 'to');
    if (to < from || to - from + 1 > MAX_BULK) throw new BadRequestException({ message: 'units.bulkRange', field: 'to', max: MAX_BULK });
    const prefix = v.optionalString(src, 'prefix', 10) ?? '';
    const template = this.unitData({ ...src, number: 'x' }, true) as Prisma.UnitUncheckedCreateInput;
    const numbers = Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

    await this.assertNumbersFree(propertyId, numbers);
    await this.plans.assertCanAdd(auth.companyId, 'units', numbers.length);
    const now = new Date();
    await this.prisma.unit.createMany({
      data: numbers.map((number) => ({
        ...template,
        number,
        propertyId,
        companyId: auth.companyId,
        vacantSince: template.status === 'VACANT' || !template.status ? now : null,
      })),
    });
    await this.activity.log(auth, {
      action: 'unit.createBulk',
      entity: 'Property',
      entityId: propertyId,
      details: { from: numbers[0], to: numbers[numbers.length - 1], count: numbers.length },
    });
    return { created: numbers.length };
  }

  async updateUnit(auth: UserAuth, id: string, input: unknown) {
    const unit = await this.findUnit(auth, id);
    const data = this.unitData(v.body(input), false);
    if (typeof data.number === 'string' && data.number !== unit.number) await this.assertNumbersFree(unit.propertyId, [data.number], id);
    if (data.status && data.status !== unit.status) {
      data.vacantSince = data.status === 'VACANT' ? new Date() : null;
    }
    const updated = await this.prisma.unit.update({ where: { id }, data });
    await this.activity.log(auth, { action: 'unit.update', entity: 'Unit', entityId: id, details: data });
    return updated;
  }

  async removeUnit(auth: UserAuth, id: string) {
    await this.findUnit(auth, id);
    await this.prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'unit.delete', entity: 'Unit', entityId: id });
    return { ok: true };
  }

  async restoreUnit(auth: UserAuth, id: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, companyId: auth.companyId, deletedAt: { not: null }, property: propertyScope(auth) },
    });
    if (!unit) throw new NotFoundException('common.notFound');
    await this.assertNumbersFree(unit.propertyId, [unit.number], id);
    await this.plans.assertCanAdd(auth.companyId, 'units');
    await this.prisma.unit.update({ where: { id }, data: { deletedAt: null } });
    await this.activity.log(auth, { action: 'unit.restore', entity: 'Unit', entityId: id });
    return { ok: true };
  }

  // ---------------------------------------------------------------- helpers

  /** Dashboard numbers for the caller's properties. */
  async portfolioStats(auth: UserAuth) {
    const [properties, units] = await Promise.all([
      this.prisma.property.count({ where: propertyScope(auth) }),
      this.prisma.unit.findMany({
        where: { companyId: auth.companyId, deletedAt: null, property: propertyScope(auth) },
        select: { status: true },
      }),
    ]);
    return { properties, ...stats(units) };
  }

  private assertAllProperties(auth: UserAuth) {
    // A user limited to some properties cannot create new ones (they would not see them).
    if (auth.propertyIds) throw new ForbiddenException('auth.noPermission');
  }

  private async findProperty(auth: UserAuth, id: string) {
    const property = await this.prisma.property.findFirst({ where: { ...propertyScope(auth), id } });
    if (!property) throw new NotFoundException('common.notFound');
    return property;
  }

  private async findUnit(auth: UserAuth, id: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, companyId: auth.companyId, deletedAt: null, property: propertyScope(auth) },
    });
    if (!unit) throw new NotFoundException('common.notFound');
    return unit;
  }

  private async assertNumbersFree(propertyId: string, numbers: string[], exceptId?: string) {
    const clash = await this.prisma.unit.findFirst({
      where: { propertyId, deletedAt: null, number: { in: numbers }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { number: true },
    });
    if (clash) throw new ConflictException({ message: 'units.numberTaken', field: 'number', number: clash.number });
  }

  private propertyData(src: Record<string, unknown>, creating: boolean): Prisma.PropertyUncheckedUpdateInput {
    const has = (k: string) => creating || src[k] !== undefined;
    const data: Prisma.PropertyUncheckedUpdateInput = {};
    if (has('name')) data.name = v.requiredString(src, 'name', 160);
    if (has('ownership')) data.ownership = v.oneOf(src, 'ownership', OWNERSHIPS, 'OWNED');
    if (has('category')) data.category = v.oneOf(src, 'category', CATEGORIES, 'BUILDING');
    data.governorate = v.nullableString(src, 'governorate', 80);
    data.wilayat = v.nullableString(src, 'wilayat', 80);
    data.address = v.nullableString(src, 'address', 300);
    data.plotNumber = v.nullableString(src, 'plotNumber', 60);
    data.notes = v.nullableString(src, 'notes', 2000);
    data.floors = v.optionalInt(src, 'floors', 0, 300);
    data.propertyValue = v.optionalBaisa(src, 'propertyValue');
    data.investmentCost = v.optionalBaisa(src, 'investmentCost');
    return data;
  }

  private unitData(src: Record<string, unknown>, creating: boolean): Prisma.UnitUncheckedUpdateInput {
    const has = (k: string) => creating || src[k] !== undefined;
    const data: Prisma.UnitUncheckedUpdateInput = {};
    if (has('number')) data.number = v.requiredString(src, 'number', 30);
    if (has('type')) data.type = v.oneOf(src, 'type', UNIT_TYPES, 'APARTMENT');
    if (has('status')) data.status = v.oneOf(src, 'status', UNIT_STATUSES, 'VACANT');
    if (has('askingRent')) data.askingRent = v.optionalBaisa(src, 'askingRent') ?? 0;
    data.floor = v.nullableString(src, 'floor', 20);
    data.area = v.optionalNumber(src, 'area');
    data.bedrooms = v.optionalInt(src, 'bedrooms', 0, 50);
    data.bathrooms = v.optionalInt(src, 'bathrooms', 0, 50);
    data.electricityMeter = v.nullableString(src, 'electricityMeter', 60);
    data.waterMeter = v.nullableString(src, 'waterMeter', 60);
    data.notes = v.nullableString(src, 'notes', 2000);
    return data;
  }
}
