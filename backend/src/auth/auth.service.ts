import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { TokenService } from './token.service.js';
import { AccessService } from './access.service.js';
import { publicPlan } from '../plans/plans.service.js';
import type { AuthContext } from '../common/auth-context.js';
import * as v from '../common/validate.js';

const BCRYPT_ROUNDS = 12;
// Used when the email does not exist, so a wrong email and a wrong password take the same time.
const DUMMY_HASH = bcrypt.hashSync('aqartech-timing-guard', BCRYPT_ROUNDS);

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
  ) {}

  /** A company or an individual owner signs up. The subscription starts PENDING until activated. */
  async register(input: unknown) {
    const src = v.body(input);
    const accountType = v.oneOf(src, 'accountType', ['COMPANY', 'INDIVIDUAL'] as const);
    const ownerName = v.requiredString(src, 'ownerName', 120);
    const companyName =
      accountType === 'INDIVIDUAL' ? (v.optionalString(src, 'companyName', 160) ?? ownerName) : v.requiredString(src, 'companyName', 160);
    const email = v.email(src);
    const password = v.password(src);
    const phone = v.optionalString(src, 'phone', 30);
    const planCode = v.requiredString(src, 'planCode', 60);
    const billingCycle = v.oneOf(src, 'billingCycle', ['MONTHLY', 'YEARLY'] as const, 'MONTHLY');
    const locale = v.oneOf(src, 'locale', ['en', 'ar'] as const, 'en');

    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isActive) throw new BadRequestException({ message: 'plan.notFound', field: 'planCode' });
    if (plan.audience !== 'ANY' && plan.audience !== accountType) {
      throw new BadRequestException({ message: 'plan.wrongAudience', field: 'planCode' });
    }

    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException({ message: 'auth.emailTaken', field: 'email' });

    const passwordHash = await hashPassword(password);
    const user = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { type: accountType, name: companyName, ownerName, email, phone, locale },
      });
      await tx.subscription.create({
        data: { companyId: company.id, planId: plan.id, billingCycle, status: 'PENDING' },
      });
      return tx.user.create({
        data: { companyId: company.id, name: ownerName, email, phone, passwordHash, isCompanyAdmin: true },
      });
    });

    await this.activity.log(null, {
      action: 'company.register',
      companyId: user.companyId,
      entity: 'Company',
      entityId: user.companyId,
      details: { planCode, billingCycle, accountType },
    });

    return { token: this.tokens.sign({ sub: user.id, kind: 'user' }), me: await this.userMe(user.id) };
  }

  async login(input: unknown) {
    const src = v.body(input);
    const email = v.email(src);
    const password = typeof src.password === 'string' ? src.password : '';

    const user = await this.prisma.user.findUnique({ where: { email }, include: { company: true } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive || user.deletedAt || user.company.deletedAt) {
      throw new UnauthorizedException('auth.wrongCredentials');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = this.tokens.sign({ sub: user.id, kind: 'user' });
    await this.activity.log(
      { kind: 'user', userId: user.id, companyId: user.companyId } as AuthContext,
      { action: 'auth.login' },
    );
    return { token, me: await this.userMe(user.id) };
  }

  /** Platform admin login (فريق إدارة المنصة) — separate accounts from subscribers. */
  async adminLogin(input: unknown) {
    const src = v.body(input);
    const email = v.email(src);
    const password = typeof src.password === 'string' ? src.password : '';

    const admin = await this.prisma.platformAdmin.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !ok || !admin.isActive) throw new UnauthorizedException('auth.wrongCredentials');

    await this.prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await this.activity.log({ kind: 'admin', adminId: admin.id }, { action: 'admin.login' });
    return { token: this.tokens.sign({ sub: admin.id, kind: 'admin' }), me: await this.adminMe(admin.id) };
  }

  me(auth: AuthContext) {
    return auth.kind === 'admin' ? this.adminMe(auth.adminId) : this.userMe(auth.userId);
  }

  private async adminMe(adminId: string) {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: adminId } });
    return { kind: 'admin' as const, admin: { id: admin.id, name: admin.name, email: admin.email } };
  }

  private async userMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true, company: { include: { subscription: { include: { plan: true } } } } },
    });
    const sub = user.company.subscription;
    return {
      kind: 'user' as const,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        kind: user.kind,
        isCompanyAdmin: user.isCompanyAdmin,
        roleId: user.roleId,
      },
      company: {
        id: user.company.id,
        type: user.company.type,
        name: user.company.name,
        ownerName: user.company.ownerName,
        email: user.company.email,
        phone: user.company.phone,
        locale: user.company.locale,
      },
      subscription: sub
        ? {
            status: sub.status,
            billingCycle: sub.billingCycle,
            startDate: sub.startDate,
            endDate: sub.endDate,
            plan: publicPlan(sub.plan),
          }
        : null,
      access: this.access.compute(user),
    };
  }
}
