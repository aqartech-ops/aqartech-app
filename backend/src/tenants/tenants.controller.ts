import { Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';
import { FieldsService } from '../fields/fields.module.js';

/**
 * Tenants (المستأجرون): records kept by the company — tenants never sign in.
 * Leases (next batch) link a tenant to a unit; then users limited to some properties
 * will only see tenants of those properties.
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly fields: FieldsService,
  ) {}

  list(auth: UserAuth, trash = false) {
    return this.prisma.tenant.findMany({
      where: { companyId: auth.companyId, deletedAt: trash ? { not: null } : null, ...this.scope(auth) },
      orderBy: { name: 'asc' },
    });
  }

  async get(auth: UserAuth, id: string) {
    return this.find(auth, id);
  }

  async create(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const data = this.data(src, true) as Prisma.TenantUncheckedCreateInput;
    const custom = await this.fields.apply('tenant', src, null);
    if (custom !== undefined) data.custom = custom;
    await this.assertIdFree(auth, data.civilId ?? null);
    const tenant = await this.prisma.tenant.create({ data: { ...data, companyId: auth.companyId } });
    await this.activity.log(auth, { action: 'tenant.create', entity: 'Tenant', entityId: tenant.id, details: { name: tenant.name } });
    return tenant;
  }

  async update(auth: UserAuth, id: string, input: unknown) {
    const saved = await this.find(auth, id);
    const src = v.body(input);
    const data = this.data(src, false);
    const custom = await this.fields.apply('tenant', src, saved);
    if (custom !== undefined) data.custom = custom;
    if (typeof data.civilId === 'string') await this.assertIdFree(auth, data.civilId, id);
    const tenant = await this.prisma.tenant.update({ where: { id }, data });
    await this.activity.log(auth, { action: 'tenant.update', entity: 'Tenant', entityId: id, details: data });
    return tenant;
  }

  async remove(auth: UserAuth, id: string) {
    await this.find(auth, id);
    await this.prisma.tenant.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'tenant.delete', entity: 'Tenant', entityId: id });
    return { ok: true };
  }

  async restore(auth: UserAuth, id: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, companyId: auth.companyId, deletedAt: { not: null } } });
    if (!tenant) throw new NotFoundException('common.notFound');
    await this.assertIdFree(auth, tenant.civilId, id);
    await this.prisma.tenant.update({ where: { id }, data: { deletedAt: null } });
    await this.activity.log(auth, { action: 'tenant.restore', entity: 'Tenant', entityId: id });
    return { ok: true };
  }

  async count(auth: UserAuth) {
    return this.prisma.tenant.count({ where: { companyId: auth.companyId, deletedAt: null } });
  }

  /** Users limited to some properties see tenants with a lease there, or not yet leased anywhere. */
  private scope(auth: UserAuth): Prisma.TenantWhereInput {
    if (!auth.propertyIds) return {};
    return { OR: [{ leases: { some: { propertyId: { in: auth.propertyIds }, deletedAt: null } } }, { leases: { none: {} } }] };
  }

  private async find(auth: UserAuth, id: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, companyId: auth.companyId, deletedAt: null, ...this.scope(auth) } });
    if (!tenant) throw new NotFoundException('common.notFound');
    return tenant;
  }

  /** The same civil ID cannot be registered twice in one company. */
  private async assertIdFree(auth: UserAuth, civilId: string | null, exceptId?: string) {
    if (!civilId) return;
    const clash = await this.prisma.tenant.findFirst({
      where: { companyId: auth.companyId, deletedAt: null, civilId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true, name: true },
    });
    if (clash) throw new ConflictException({ message: 'tenant.civilIdTaken', field: 'civilId', name: clash.name });
  }

  private data(src: Record<string, unknown>, creating: boolean): Prisma.TenantUncheckedUpdateInput {
    const data: Prisma.TenantUncheckedUpdateInput = {};
    if (creating || src.name !== undefined) data.name = v.requiredString(src, 'name', 160);
    if (creating || src.type !== undefined) data.type = v.oneOf(src, 'type', ['INDIVIDUAL', 'COMPANY'] as const, 'INDIVIDUAL');
    data.civilId = v.nullableString(src, 'civilId', 30);
    data.idExpiry = v.optionalDate(src, 'idExpiry');
    data.crNumber = v.nullableString(src, 'crNumber', 30);
    data.nationality = v.nullableString(src, 'nationality', 60);
    data.phone = v.nullableString(src, 'phone', 30);
    data.phone2 = v.nullableString(src, 'phone2', 30);
    if (src.email !== undefined) data.email = src.email ? v.email(src) : null;
    data.employer = v.nullableString(src, 'employer', 120);
    data.guarantorName = v.nullableString(src, 'guarantorName', 120);
    data.guarantorPhone = v.nullableString(src, 'guarantorPhone', 30);
    data.guarantorCivilId = v.nullableString(src, 'guarantorCivilId', 30);
    data.notes = v.nullableString(src, 'notes', 2000);
    return data;
  }
}

const isTrash = (q?: string) => q === '1' || q === 'true';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @RequirePermission('tenants', 'VIEW')
  @Get()
  list(@Auth() auth: UserAuth, @Query('trash') trash?: string) {
    return this.tenants.list(auth, isTrash(trash));
  }

  @RequirePermission('tenants', 'VIEW')
  @Get(':id')
  get(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.tenants.get(auth, id);
  }

  @RequirePermission('tenants', 'EDIT')
  @Post()
  create(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.tenants.create(auth, body);
  }

  @RequirePermission('tenants', 'EDIT')
  @Patch(':id')
  update(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.tenants.update(auth, id, body);
  }

  @RequirePermission('tenants', 'EDIT')
  @Delete(':id')
  remove(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.tenants.remove(auth, id);
  }

  @RequirePermission('tenants', 'EDIT')
  @Post(':id/restore')
  restore(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.tenants.restore(auth, id);
  }
}

@Module({
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
