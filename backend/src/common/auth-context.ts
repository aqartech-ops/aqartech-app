import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AccessLevel, AccessMap, SectionKey } from './sections.js';

/** Who is calling. Attached to the request by AuthGuard. */
export type AuthContext =
  | { kind: 'admin'; adminId: string }
  | {
      kind: 'user';
      userId: string;
      companyId: string;
      isCompanyAdmin: boolean;
      userKind: 'STAFF' | 'OWNER';
      /** Effective access per section = plan features ∩ role permissions. */
      access: AccessMap;
      /** Properties this user may see; null = all of the company's properties. */
      propertyIds: string[] | null;
    };

export type UserAuth = Extract<AuthContext, { kind: 'user' }>;
export type AdminAuth = Extract<AuthContext, { kind: 'admin' }>;

export const IS_PUBLIC = 'aqartech:isPublic';
export const ADMIN_ONLY = 'aqartech:adminOnly';
export const REQUIRED_PERMISSION = 'aqartech:permission';
export const ANY_AUTH = 'aqartech:anyAuth';

/** Route accepts both platform admins and company users (e.g. /auth/me). */
export const AnyAuthenticated = () => SetMetadata(ANY_AUTH, true);

/** Route needs no token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route is for platform admins only. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

/** Route needs a company user with at least `level` on `section`. */
export const RequirePermission = (section: SectionKey, level: Exclude<AccessLevel, 'HIDDEN'>) =>
  SetMetadata(REQUIRED_PERMISSION, { section, level });

/** Inject the caller's AuthContext into a handler parameter. */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  return ctx.switchToHttp().getRequest().auth;
});
