import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { PlansService } from '../plans/plans.service.js';
import { hashPassword } from '../auth/auth.service.js';
import type { UserAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  kind: true,
  isCompanyAdmin: true,
  isActive: true,
  roleId: true,
  role: { select: { id: true, name: true } },
  lastLoginAt: true,
  createdAt: true,
  deletedAt: true,
} as const;

/** Company users (موظفو المشترك). Owners (kind OWNER) are managed by the owners section in phase 3. */
@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly activity: ActivityService,
  ) {}

  list(auth: UserAuth, trash = false) {
    return this.prisma.user.findMany({
      where: { companyId: auth.companyId, kind: 'STAFF', deletedAt: trash ? { not: null } : null },
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const name = v.requiredString(src, 'name', 120);
    const email = v.email(src);
    const password = v.password(src);
    const phone = v.optionalString(src, 'phone', 30);
    const roleId = await this.checkRole(auth, v.optionalString(src, 'roleId', 60));

    await this.plans.assertCanAdd(auth.companyId, 'users');
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException({ message: 'auth.emailTaken', field: 'email' });
    }

    const user = await this.prisma.user.create({
      data: { companyId: auth.companyId, name, email, phone, roleId, passwordHash: await hashPassword(password) },
      select: PUBLIC_FIELDS,
    });
    await this.activity.log(auth, { action: 'user.create', entity: 'User', entityId: user.id, details: { name, email, roleId } });
    return user;
  }

  async update(auth: UserAuth, id: string, input: unknown) {
    const existing = await this.find(auth, id);
    const src = v.body(input);
    if (existing.isCompanyAdmin && (src.isActive === false || src.roleId !== undefined)) {
      throw new ForbiddenException('user.cannotChangeMainAccount');
    }
    const email = src.email !== undefined ? v.email(src) : undefined;
    if (email && email !== existing.email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException({ message: 'auth.emailTaken', field: 'email' });
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: src.name !== undefined ? v.requiredString(src, 'name', 120) : undefined,
        email,
        phone: src.phone !== undefined ? (v.optionalString(src, 'phone', 30) ?? null) : undefined,
        isActive: v.optionalBoolean(src, 'isActive'),
        roleId: src.roleId !== undefined ? ((await this.checkRole(auth, v.optionalString(src, 'roleId', 60))) ?? null) : undefined,
        passwordHash: src.password !== undefined ? await hashPassword(v.password(src)) : undefined,
      },
      select: PUBLIC_FIELDS,
    });
    const { password: _omit, ...logged } = src;
    await this.activity.log(auth, { action: 'user.update', entity: 'User', entityId: id, details: logged });
    return user;
  }

  /** Soft delete — goes to the trash and can be restored. */
  async remove(auth: UserAuth, id: string) {
    const existing = await this.find(auth, id);
    if (existing.isCompanyAdmin) throw new ForbiddenException('user.cannotChangeMainAccount');
    if (existing.id === auth.userId) throw new BadRequestException('user.cannotDeleteSelf');
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'user.delete', entity: 'User', entityId: id });
    return { ok: true };
  }

  async restore(auth: UserAuth, id: string) {
    await this.find(auth, id, true);
    await this.plans.assertCanAdd(auth.companyId, 'users');
    const user = await this.prisma.user.update({ where: { id }, data: { deletedAt: null }, select: PUBLIC_FIELDS });
    await this.activity.log(auth, { action: 'user.restore', entity: 'User', entityId: id });
    return user;
  }

  private async find(auth: UserAuth, id: string, deleted = false) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId: auth.companyId, kind: 'STAFF', deletedAt: deleted ? { not: null } : null },
    });
    if (!user) throw new NotFoundException('common.notFound');
    return user;
  }

  private async checkRole(auth: UserAuth, roleId: string | undefined) {
    if (!roleId) return undefined;
    const role = await this.prisma.role.findFirst({ where: { id: roleId, companyId: auth.companyId, deletedAt: null } });
    if (!role) throw new BadRequestException({ message: 'role.notFound', field: 'roleId' });
    return role.id;
  }
}
