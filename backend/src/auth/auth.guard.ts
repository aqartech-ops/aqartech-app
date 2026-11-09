import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenService } from './token.service.js';
import { AccessService } from './access.service.js';
import {
  ADMIN_ONLY,
  ANY_AUTH,
  IS_PUBLIC,
  REQUIRED_PERMISSION,
  type AuthContext,
} from '../common/auth-context.js';
import { LEVEL_RANK, type AccessLevel, type SectionKey } from '../common/sections.js';
import { adminCan, asRole } from '../admin/roles.js';

/** Global guard: every route needs a valid token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.meta<boolean>(IS_PUBLIC, ctx)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('auth.required');
    const payload = this.tokens.verify(header.slice(7));

    const adminOnly = this.meta<boolean>(ADMIN_ONLY, ctx);
    const anyAuth = this.meta<boolean>(ANY_AUTH, ctx);

    if (payload.kind === 'admin') {
      if (!adminOnly && !anyAuth) throw new ForbiddenException('auth.forbidden');
      const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
      if (!admin || !admin.isActive || issuedBeforePasswordChange(payload.iat, admin.passwordChangedAt)) {
        throw new UnauthorizedException('auth.invalidToken');
      }
      const role = asRole(admin.role);
      const path = String(req.path ?? req.url ?? '').split('?')[0];
      // An admin whose password was set by another admin must change it first.
      if (admin.mustChangePassword && !path.startsWith('/admin/auth/') && path !== '/auth/me') {
        throw new ForbiddenException('auth.mustChangePassword');
      }
      if (!adminCan(role, String(req.method ?? 'GET'), path)) throw new ForbiddenException('auth.noPermission');
      req.auth = { kind: 'admin', adminId: admin.id, adminRole: role } satisfies AuthContext;
      return true;
    }

    if (adminOnly) throw new ForbiddenException('auth.forbidden');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, company: { include: { subscription: { include: { plan: true } } } } },
    });
    if (!user || !user.isActive || user.deletedAt || user.company.deletedAt || issuedBeforePasswordChange(payload.iat, user.passwordChangedAt)) {
      throw new UnauthorizedException('auth.invalidToken');
    }

    const path = String(req.path ?? req.url ?? '').split('?')[0];
    // a password given by someone else (owner portal invitation) is changed first
    if (user.mustChangePassword && path !== '/auth/change-password' && path !== '/auth/me') {
      throw new ForbiddenException('auth.mustChangePassword');
    }
    const access = this.access.compute(user);
    req.auth = {
      kind: 'user',
      userId: user.id,
      companyId: user.companyId,
      isCompanyAdmin: user.isCompanyAdmin,
      userKind: user.kind,
      access,
      propertyIds:
        user.isCompanyAdmin || !user.role || user.role.deletedAt || user.role.propertyIds.length === 0
          ? null
          : user.role.propertyIds,
      ownerId: user.kind === 'OWNER' ? user.ownerId : null,
    } satisfies AuthContext;

    const required = this.meta<{ section: SectionKey; level: AccessLevel }>(REQUIRED_PERMISSION, ctx);
    if (required && LEVEL_RANK[access[required.section]] < LEVEL_RANK[required.level]) {
      throw new ForbiddenException('auth.noPermission');
    }
    return true;
  }
}

/** A password change/reset signs out every session that was opened before it. */
function issuedBeforePasswordChange(iat: number, changedAt: Date | null): boolean {
  return !!changedAt && iat < Math.floor(changedAt.getTime() / 1000);
}
