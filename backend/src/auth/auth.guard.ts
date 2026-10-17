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
      req.auth = { kind: 'admin', adminId: admin.id } satisfies AuthContext;
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

    const access = this.access.compute(user);
    req.auth = {
      kind: 'user',
      userId: user.id,
      companyId: user.companyId,
      isCompanyAdmin: user.isCompanyAdmin,
      userKind: user.kind,
      access,
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
