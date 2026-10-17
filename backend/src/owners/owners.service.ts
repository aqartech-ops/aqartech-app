import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { PlansService } from '../plans/plans.service.js';
import { propertyScope } from '../properties/properties.service.js';
import type { UserAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';

export const FEE_METHODS = ['PERCENT_OF_COLLECTED', 'PERCENT_OF_DUE', 'FIXED'] as const;
export const STATEMENT_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
const FULL_SHARE = 10000; // basis points = 100%

/**
 * Owners (الملاك), the management agreement of a managed property (عقد الإدارة),
 * and the partners of a property with their shares (الشركاء ونسبهم).
 */
@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly activity: ActivityService,
  ) {}

  // ---------------------------------------------------------------- owners

  async list(auth: UserAuth, trash = false) {
    const owners = await this.prisma.owner.findMany({
      where: { companyId: auth.companyId, deletedAt: trash ? { not: null } : null },
      orderBy: { name: 'asc' },
      include: {
        partners: { where: { property: propertyScope(auth) }, select: { propertyId: true } },
        agreements: { where: { status: 'ACTIVE', property: propertyScope(auth) }, select: { propertyId: true } },
      },
    });
    return owners.map(({ partners, agreements, ...o }) => ({
      ...o,
      propertiesCount: new Set([...partners, ...agreements].map((x) => x.propertyId)).size,
    }));
  }

  async get(auth: UserAuth, id: string) {
    const owner = await this.prisma.owner.findFirst({
      where: { id, companyId: auth.companyId, deletedAt: null },
      include: {
        partners: {
          where: { property: propertyScope(auth) },
          include: { property: { select: { id: true, name: true, wilayat: true, ownership: true } } },
        },
        agreements: {
          where: { property: propertyScope(auth) },
          orderBy: { startDate: 'desc' },
          include: { property: { select: { id: true, name: true, wilayat: true } } },
        },
      },
    });
    if (!owner) throw new NotFoundException('common.notFound');
    return owner;
  }

  async create(auth: UserAuth, input: unknown) {
    const data = this.ownerData(v.body(input), true) as Prisma.OwnerUncheckedCreateInput;
    await this.plans.assertCanAdd(auth.companyId, 'owners');
    const owner = await this.prisma.owner.create({ data: { ...data, companyId: auth.companyId } });
    await this.activity.log(auth, { action: 'owner.create', entity: 'Owner', entityId: owner.id, details: { name: owner.name } });
    return owner;
  }

  async update(auth: UserAuth, id: string, input: unknown) {
    await this.findOwner(auth, id);
    const data = this.ownerData(v.body(input), false);
    const owner = await this.prisma.owner.update({ where: { id }, data });
    await this.activity.log(auth, { action: 'owner.update', entity: 'Owner', entityId: id, details: data });
    return owner;
  }

  async remove(auth: UserAuth, id: string) {
    await this.findOwner(auth, id);
    const active = await this.prisma.managementAgreement.count({ where: { ownerId: id, status: 'ACTIVE' } });
    if (active) throw new BadRequestException('owner.hasActiveAgreement');
    await this.prisma.owner.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'owner.delete', entity: 'Owner', entityId: id });
    return { ok: true };
  }

  async restore(auth: UserAuth, id: string) {
    const owner = await this.prisma.owner.findFirst({ where: { id, companyId: auth.companyId, deletedAt: { not: null } } });
    if (!owner) throw new NotFoundException('common.notFound');
    await this.plans.assertCanAdd(auth.companyId, 'owners');
    await this.prisma.owner.update({ where: { id }, data: { deletedAt: null } });
    await this.activity.log(auth, { action: 'owner.restore', entity: 'Owner', entityId: id });
    return { ok: true };
  }

  // ---------------------------------------------------------------- agreement

  /** Current (active) agreement of a property and its history. */
  async agreements(auth: UserAuth, propertyId: string) {
    await this.findProperty(auth, propertyId);
    return this.prisma.managementAgreement.findMany({
      where: { propertyId },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      include: { owner: { select: { id: true, name: true, phone: true } } },
    });
  }

  /** Create the active agreement, or update it if one is active. */
  async saveAgreement(auth: UserAuth, propertyId: string, input: unknown) {
    const property = await this.findProperty(auth, propertyId);
    if (property.ownership !== 'MANAGED') throw new BadRequestException('agreement.propertyNotManaged');
    const src = v.body(input);

    const ownerId = v.requiredString(src, 'ownerId', 60);
    await this.findOwner(auth, ownerId);
    const startDate = v.requiredDate(src, 'startDate');
    const endDate = v.optionalDate(src, 'endDate') ?? null;
    if (endDate && endDate <= startDate) throw new BadRequestException({ message: 'validation.endBeforeStart', field: 'endDate' });
    const feeMethod = v.oneOf(src, 'feeMethod', FEE_METHODS, 'PERCENT_OF_COLLECTED');
    const statementPeriod = v.oneOf(src, 'statementPeriod', STATEMENT_PERIODS, 'MONTHLY');
    let feeRateBp: number | null = null;
    let feeFixed: number | null = null;
    if (feeMethod === 'FIXED') {
      feeFixed = v.optionalBaisa(src, 'feeFixed') ?? null;
      if (feeFixed === null) throw new BadRequestException({ message: 'validation.required', field: 'feeFixed' });
    } else {
      feeRateBp = v.optionalInt(src, 'feeRateBp', 0, FULL_SHARE) ?? null;
      if (feeRateBp === null) throw new BadRequestException({ message: 'validation.required', field: 'feeRateBp' });
    }
    const data = {
      ownerId,
      startDate,
      endDate,
      feeMethod,
      feeRateBp,
      feeFixed,
      statementPeriod,
      notes: v.nullableString(src, 'notes', 2000) ?? null,
    };

    const active = await this.prisma.managementAgreement.findFirst({ where: { propertyId, status: 'ACTIVE' } });
    const agreement = active
      ? await this.prisma.managementAgreement.update({ where: { id: active.id }, data })
      : await this.prisma.managementAgreement.create({ data: { ...data, propertyId, companyId: auth.companyId } });
    await this.activity.log(auth, {
      action: active ? 'agreement.update' : 'agreement.create',
      entity: 'ManagementAgreement',
      entityId: agreement.id,
      details: { ...data, propertyId },
    });
    return agreement;
  }

  /** End the active agreement (kept in history); a new one can then be created. */
  async endAgreement(auth: UserAuth, propertyId: string, input: unknown) {
    await this.findProperty(auth, propertyId);
    const src = v.body(input ?? {});
    const active = await this.prisma.managementAgreement.findFirst({ where: { propertyId, status: 'ACTIVE' } });
    if (!active) throw new NotFoundException('common.notFound');
    const endDate = v.optionalDate(src, 'endDate') ?? new Date();
    const agreement = await this.prisma.managementAgreement.update({ where: { id: active.id }, data: { status: 'ENDED', endDate } });
    await this.activity.log(auth, { action: 'agreement.end', entity: 'ManagementAgreement', entityId: active.id, details: { endDate } });
    return agreement;
  }

  // ---------------------------------------------------------------- partners

  async partners(auth: UserAuth, propertyId: string) {
    await this.findProperty(auth, propertyId);
    return this.prisma.propertyPartner.findMany({
      where: { propertyId },
      orderBy: { shareBp: 'desc' },
      include: { owner: { select: { id: true, name: true, phone: true } } },
    });
  }

  /** Replace the whole partner list. Shares must add up to exactly 100%. Empty list = no partners. */
  async savePartners(auth: UserAuth, propertyId: string, input: unknown) {
    await this.findProperty(auth, propertyId);
    const src = v.body(input);
    const raw = Array.isArray(src.partners) ? src.partners : [];
    const partners = raw.map((p, i) => {
      const item = v.body(p);
      const ownerId = v.requiredString(item, 'ownerId', 60);
      const shareBp = v.optionalInt(item, 'shareBp', 1, FULL_SHARE);
      if (!shareBp) throw new BadRequestException({ message: 'partners.invalidShare', field: `partners.${i}` });
      return { ownerId, shareBp };
    });
    if (new Set(partners.map((p) => p.ownerId)).size !== partners.length) throw new BadRequestException('partners.duplicateOwner');
    const total = partners.reduce((sum, p) => sum + p.shareBp, 0);
    if (partners.length && total !== FULL_SHARE) throw new BadRequestException({ message: 'partners.totalNot100', total });
    for (const p of partners) await this.findOwner(auth, p.ownerId);

    await this.prisma.$transaction([
      this.prisma.propertyPartner.deleteMany({ where: { propertyId } }),
      this.prisma.propertyPartner.createMany({
        data: partners.map((p) => ({ ...p, propertyId, companyId: auth.companyId })),
      }),
    ]);
    await this.activity.log(auth, { action: 'partners.update', entity: 'Property', entityId: propertyId, details: { partners } });
    return this.partners(auth, propertyId);
  }

  // ---------------------------------------------------------------- helpers

  private async findOwner(auth: UserAuth, id: string) {
    const owner = await this.prisma.owner.findFirst({ where: { id, companyId: auth.companyId, deletedAt: null } });
    if (!owner) throw new NotFoundException({ message: 'owner.notFound', field: 'ownerId' });
    return owner;
  }

  private async findProperty(auth: UserAuth, id: string) {
    const property = await this.prisma.property.findFirst({ where: { ...propertyScope(auth), id } });
    if (!property) throw new NotFoundException('common.notFound');
    return property;
  }

  private ownerData(src: Record<string, unknown>, creating: boolean): Prisma.OwnerUncheckedUpdateInput {
    const data: Prisma.OwnerUncheckedUpdateInput = {};
    if (creating || src.name !== undefined) data.name = v.requiredString(src, 'name', 160);
    if (creating || src.type !== undefined) data.type = v.oneOf(src, 'type', ['INDIVIDUAL', 'COMPANY'] as const, 'INDIVIDUAL');
    data.civilId = v.nullableString(src, 'civilId', 30);
    data.crNumber = v.nullableString(src, 'crNumber', 30);
    data.nationality = v.nullableString(src, 'nationality', 60);
    data.phone = v.nullableString(src, 'phone', 30);
    if (src.email !== undefined) data.email = src.email ? v.email(src) : null;
    data.bankName = v.nullableString(src, 'bankName', 80);
    data.accountName = v.nullableString(src, 'accountName', 120);
    data.accountNumber = v.nullableString(src, 'accountNumber', 40);
    data.notes = v.nullableString(src, 'notes', 2000);
    return data;
  }

  /** Users limited to some properties cannot manage company-wide owner records. */
  assertAllProperties(auth: UserAuth) {
    if (auth.propertyIds) throw new ForbiddenException('auth.noPermission');
  }
}
