import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';
import { normalizePermissions } from '../common/sections.js';
import * as v from '../common/validate.js';

/** Roles: a named set of per-section levels (EDIT / VIEW / HIDDEN), optionally limited to some properties. */
@Controller('roles')
export class RoleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  @RequirePermission('users', 'VIEW')
  @Get()
  list(@Auth() auth: UserAuth) {
    return this.prisma.role.findMany({
      where: { companyId: auth.companyId, deletedAt: null },
      include: { _count: { select: { users: { where: { deletedAt: null } } } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  @RequirePermission('users', 'EDIT')
  @Post()
  async create(@Auth() auth: UserAuth, @Body() input: unknown) {
    const src = v.body(input);
    const role = await this.prisma.role.create({
      data: {
        companyId: auth.companyId,
        name: v.requiredString(src, 'name', 80),
        permissions: normalizePermissions(src.permissions),
        propertyIds: this.propertyIds(src.propertyIds),
      },
    });
    await this.activity.log(auth, { action: 'role.create', entity: 'Role', entityId: role.id, details: { name: role.name } });
    return role;
  }

  @RequirePermission('users', 'EDIT')
  @Patch(':id')
  async update(@Auth() auth: UserAuth, @Param('id') id: string, @Body() input: unknown) {
    await this.find(auth, id);
    const src = v.body(input);
    const role = await this.prisma.role.update({
      where: { id },
      data: {
        name: src.name !== undefined ? v.requiredString(src, 'name', 80) : undefined,
        permissions: src.permissions !== undefined ? normalizePermissions(src.permissions) : undefined,
        propertyIds: src.propertyIds !== undefined ? this.propertyIds(src.propertyIds) : undefined,
      },
    });
    await this.activity.log(auth, { action: 'role.update', entity: 'Role', entityId: id, details: src });
    return role;
  }

  /** Soft delete; users keep working with no role (= HIDDEN everywhere except always-on sections). */
  @RequirePermission('users', 'EDIT')
  @Delete(':id')
  async remove(@Auth() auth: UserAuth, @Param('id') id: string) {
    await this.find(auth, id);
    await this.prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'role.delete', entity: 'Role', entityId: id });
    return { ok: true };
  }

  private async find(auth: UserAuth, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, companyId: auth.companyId, deletedAt: null } });
    if (!role) throw new NotFoundException('common.notFound');
    return role;
  }

  private propertyIds(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string').slice(0, 1000) : [];
  }
}
