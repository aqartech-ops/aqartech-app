import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { AdminOnly, Auth, Public, type AdminAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';
import { ADMIN_ROLES, keepsAnOwner } from '../admin/roles.js';
import { AuthService, hashPassword } from './auth.service.js';
import { TokenService } from './token.service.js';
import { decryptSecret, encryptSecret, hashRecoveryCode, newRecoveryCodes, newSecret, otpauthUrl, verifyTotp, base32Decode } from './totp.js';

const ISSUER = 'AqarTech';
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;

/** Key that encrypts the 2FA secrets at rest: ADMIN_2FA_KEY, or derived from JWT_SECRET when not set. */
function keyMaterial(): string {
  const key = process.env.ADMIN_2FA_KEY || process.env.JWT_SECRET;
  if (!key) throw new Error('ADMIN_2FA_KEY (or JWT_SECRET) is missing in backend/.env');
  return key;
}

/** A readable temporary password for an admin added or reset by the owner (shown once). */
function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(14);
  return Array.from(bytes, (b: number) => alphabet[b % alphabet.length]).join('');
}

/** Two-step sign-in checks, with a lock after repeated wrong codes. */
@Injectable()
export class TwoFactorService {
  private failures = new Map<string, { count: number; until: number }>();

  constructor(private readonly prisma: PrismaService) {}

  private locked(adminId: string) {
    const f = this.failures.get(adminId);
    return !!f && f.count >= MAX_FAILURES && Date.now() < f.until;
  }

  private fail(adminId: string) {
    const f = this.failures.get(adminId);
    const fresh = !f || Date.now() >= f.until;
    this.failures.set(adminId, { count: fresh ? 1 : f.count + 1, until: Date.now() + LOCK_MS });
  }

  /** A 6-digit code from the app, or one of the recovery codes (used up). */
  async check(adminId: string, code: unknown): Promise<'code' | 'recovery'> {
    if (this.locked(adminId)) throw new ForbiddenException('auth.twoFactorLocked');
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin || !admin.totpEnabled || !admin.totpSecret) throw new UnauthorizedException('auth.wrongCredentials');
    const text = typeof code === 'string' ? code.trim() : '';
    if (/^\d[\d\s]{5,8}$/.test(text) && verifyTotp(base32Decode(decryptSecret(admin.totpSecret, keyMaterial())), text, Date.now())) {
      this.failures.delete(adminId);
      return 'code';
    }
    const hashes = (Array.isArray(admin.recoveryCodes) ? admin.recoveryCodes : []) as string[];
    const hash = hashRecoveryCode(text);
    if (text.length >= 10 && hashes.includes(hash)) {
      await this.prisma.platformAdmin.update({ where: { id: adminId }, data: { recoveryCodes: hashes.filter((h) => h !== hash) } });
      this.failures.delete(adminId);
      return 'recovery';
    }
    this.fail(adminId);
    throw new BadRequestException({ message: 'auth.wrongCode', field: 'code' });
  }
}

/** Every admin, for their own account: change password, set up / turn off two-step sign-in. */
@Controller('admin/auth')
export class AdminSecurityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly twoFactor: TwoFactorService,
    private readonly activity: ActivityService,
  ) {}

  /** Step 2 of the sign-in: the ticket from step 1 + the code from the authenticator app (or a recovery code). */
  @Public()
  @HttpCode(200)
  @Post('2fa/verify')
  async verify(@Body() input: unknown) {
    const src = v.body(input);
    const adminId = this.tokens.verifyTicket(String(src.ticket ?? ''));
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin || !admin.isActive) throw new UnauthorizedException('auth.wrongCredentials');
    const used = await this.twoFactor.check(adminId, src.code);
    if (used === 'recovery') await this.activity.log({ kind: 'admin', adminId }, { action: 'admin.2fa.recoveryUsed' });
    return this.auth.adminSession(adminId);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post('change-password')
  async changePassword(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const src = v.body(input);
    const current = typeof src.currentPassword === 'string' ? src.currentPassword : '';
    const password = v.password(src);
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: auth.adminId } });
    if (!(await bcrypt.compare(current, admin.passwordHash))) {
      throw new BadRequestException({ message: 'auth.wrongCurrentPassword', field: 'currentPassword' });
    }
    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), mustChangePassword: false },
    });
    await this.activity.log(auth, { action: 'admin.changePassword', entity: 'PlatformAdmin', entityId: admin.id });
    return { ok: true, token: this.tokens.sign({ sub: admin.id, kind: 'admin' }), me: await this.auth.adminMe(admin.id) };
  }

  /** Start setting up: a new secret (not active yet) to add to the authenticator app. */
  @AdminOnly()
  @HttpCode(200)
  @Post('2fa/setup')
  async setup(@Auth() auth: AdminAuth) {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: auth.adminId } });
    if (admin.totpEnabled) throw new BadRequestException({ message: 'auth.twoFactorAlreadyOn' });
    const secret = newSecret();
    await this.prisma.platformAdmin.update({ where: { id: admin.id }, data: { totpSecret: encryptSecret(secret, keyMaterial()) } });
    return { secret, otpauthUrl: otpauthUrl(ISSUER, admin.email, secret) };
  }

  /** Finish setting up with a first code; returns the recovery codes (shown once). */
  @AdminOnly()
  @HttpCode(200)
  @Post('2fa/enable')
  async enable(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: auth.adminId } });
    if (admin.totpEnabled) throw new BadRequestException({ message: 'auth.twoFactorAlreadyOn' });
    if (!admin.totpSecret) throw new BadRequestException({ message: 'auth.twoFactorNotStarted' });
    const code = String(v.body(input).code ?? '');
    if (!verifyTotp(base32Decode(decryptSecret(admin.totpSecret, keyMaterial())), code, Date.now())) {
      throw new BadRequestException({ message: 'auth.wrongCode', field: 'code' });
    }
    const codes = newRecoveryCodes();
    await this.prisma.platformAdmin.update({ where: { id: admin.id }, data: { totpEnabled: true, recoveryCodes: codes.map(hashRecoveryCode) } });
    await this.activity.log(auth, { action: 'admin.2fa.enable', entity: 'PlatformAdmin', entityId: admin.id });
    return { recoveryCodes: codes, me: await this.auth.adminMe(admin.id) };
  }

  /** New set of recovery codes (the old ones stop working). Needs a current code. */
  @AdminOnly()
  @HttpCode(200)
  @Post('2fa/recovery-codes')
  async recoveryCodes(@Auth() auth: AdminAuth, @Body() input: unknown) {
    await this.twoFactor.check(auth.adminId, v.body(input).code);
    const codes = newRecoveryCodes();
    await this.prisma.platformAdmin.update({ where: { id: auth.adminId }, data: { recoveryCodes: codes.map(hashRecoveryCode) } });
    await this.activity.log(auth, { action: 'admin.2fa.newRecoveryCodes', entity: 'PlatformAdmin', entityId: auth.adminId });
    return { recoveryCodes: codes, me: await this.auth.adminMe(auth.adminId) };
  }

  /** Turn it off: password + a current code (or a recovery code). */
  @AdminOnly()
  @HttpCode(200)
  @Post('2fa/disable')
  async disable(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const src = v.body(input);
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: auth.adminId } });
    if (!(await bcrypt.compare(typeof src.password === 'string' ? src.password : '', admin.passwordHash))) {
      throw new BadRequestException({ message: 'auth.wrongCurrentPassword', field: 'password' });
    }
    await this.twoFactor.check(admin.id, src.code);
    await this.prisma.platformAdmin.update({ where: { id: admin.id }, data: { totpEnabled: false, totpSecret: null, recoveryCodes: [] } });
    await this.activity.log(auth, { action: 'admin.2fa.disable', entity: 'PlatformAdmin', entityId: admin.id });
    return { ok: true, me: await this.auth.adminMe(admin.id) };
  }
}

const teamRow = (a: { id: string; name: string; email: string; role: string; isActive: boolean; totpEnabled: boolean; lastLoginAt: Date | null; mustChangePassword: boolean; createdAt: Date }) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  role: a.role,
  isActive: a.isActive,
  totpEnabled: a.totpEnabled,
  mustChangePassword: a.mustChangePassword,
  lastLoginAt: a.lastLoginAt,
  createdAt: a.createdAt,
});

/** The platform team (owners only — enforced by the guard for every /admin/team route). */
@AdminOnly()
@Controller('admin/team')
export class AdminTeamController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.platformAdmin.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(teamRow);
  }

  /** Add an admin; returns a temporary password (shown once) that must be changed at the first sign-in. */
  @Post()
  async create(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const src = v.body(input);
    const email = v.email(src);
    if (await this.prisma.platformAdmin.findUnique({ where: { email } })) throw new BadRequestException({ message: 'auth.emailTaken', field: 'email' });
    const password = temporaryPassword();
    const row = await this.prisma.platformAdmin.create({
      data: {
        name: v.requiredString(src, 'name', 120),
        email,
        role: v.oneOf(src, 'role', ADMIN_ROLES),
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
      },
    });
    await this.activity.log(auth, { action: 'admin.team.create', entity: 'PlatformAdmin', entityId: row.id, details: { email, role: row.role } });
    return { admin: teamRow(row), temporaryPassword: password };
  }

  @Patch(':id')
  async update(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const target = await this.find(id);
    const src = v.body(input);
    const data: { name?: string; role?: string; isActive?: boolean } = {};
    if (src.name !== undefined) data.name = v.requiredString(src, 'name', 120);
    if (src.role !== undefined) data.role = v.oneOf(src, 'role', ADMIN_ROLES);
    if (src.isActive !== undefined) data.isActive = v.optionalBoolean(src, 'isActive');
    if (id === auth.adminId && (data.role !== undefined || data.isActive === false)) throw new BadRequestException({ message: 'admin.team.notYourself' });
    const all = await this.prisma.platformAdmin.findMany({ select: { id: true, role: true, isActive: true } });
    if (!keepsAnOwner(all, { id, ...data })) throw new BadRequestException({ message: 'admin.team.lastOwner' });
    const row = await this.prisma.platformAdmin.update({
      where: { id },
      // deactivating signs them out everywhere
      data: { ...data, ...(data.isActive === false && target.isActive ? { passwordChangedAt: new Date() } : {}) },
    });
    await this.activity.log(auth, { action: 'admin.team.update', entity: 'PlatformAdmin', entityId: id, details: data });
    return teamRow(row);
  }

  /** New temporary password; signs them out everywhere. */
  @HttpCode(200)
  @Post(':id/reset-password')
  async resetPassword(@Auth() auth: AdminAuth, @Param('id') id: string) {
    await this.find(id);
    if (id === auth.adminId) throw new BadRequestException({ message: 'admin.team.notYourself' });
    const password = temporaryPassword();
    await this.prisma.platformAdmin.update({ where: { id }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), mustChangePassword: true } });
    await this.activity.log(auth, { action: 'admin.team.resetPassword', entity: 'PlatformAdmin', entityId: id });
    return { temporaryPassword: password };
  }

  /** For an admin who lost their phone and their recovery codes: turns their two-step sign-in off. */
  @HttpCode(200)
  @Post(':id/reset-2fa')
  async reset2fa(@Auth() auth: AdminAuth, @Param('id') id: string) {
    await this.find(id);
    if (id === auth.adminId) throw new BadRequestException({ message: 'admin.team.notYourself' });
    const row = await this.prisma.platformAdmin.update({ where: { id }, data: { totpEnabled: false, totpSecret: null, recoveryCodes: [] } });
    await this.activity.log(auth, { action: 'admin.team.reset2fa', entity: 'PlatformAdmin', entityId: id });
    return teamRow(row);
  }

  private async find(id: string) {
    const row = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('common.notFound');
    return row;
  }
}
