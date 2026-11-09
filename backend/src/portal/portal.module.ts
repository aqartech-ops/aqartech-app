import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';
import { hashPassword } from '../auth/auth.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { OwnersFinanceService } from '../finance/owners-finance.service.js';
import { ReportsService } from '../finance/reports.service.js';
import { subscriptionState } from '../admin/subscriptions.js';

/** A readable temporary password, shown once to the company (it gives it to the owner). */
function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(12), (b: number) => alphabet[b % alphabet.length]).join('');
}

/** Does an owner statement concern this owner (main owner or one of the partners)? */
function concerns(st: { ownerId: string | null; details: unknown }, ownerId: string): boolean {
  if (st.ownerId === ownerId) return true;
  const splits = (st.details as { splits?: { ownerId?: string }[] } | null)?.splits ?? [];
  return splits.some((s) => s.ownerId === ownerId);
}

/**
 * Owner portal (بوابة المالك): a property owner linked to a company signs in and sees — read-only — only
 * their own properties: occupancy, rent collected, expenses, net income, their statements, payouts and account.
 * Everything is computed from the company's books, exactly as the company sees it.
 */
@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  /** The owner behind this sign-in, the properties they own (agreement or partner) and the company's subscription. */
  async context(auth: UserAuth) {
    if (auth.userKind !== 'OWNER' || !auth.ownerId) throw new ForbiddenException('auth.forbidden');
    const [owner, company] = await Promise.all([
      this.prisma.owner.findFirst({
        where: { id: auth.ownerId, companyId: auth.companyId, deletedAt: null },
        select: { id: true, name: true, agreements: { select: { propertyId: true } }, partners: { select: { propertyId: true } } },
      }),
      this.prisma.company.findUnique({ where: { id: auth.companyId }, select: { name: true, phone: true, email: true, subscription: true } }),
    ]);
    if (!owner) throw new ForbiddenException('auth.forbidden');
    // the portal works while the managing company's subscription works
    if (subscriptionState(company?.subscription ?? null)?.status !== 'ACTIVE') throw new ForbiddenException('portal.companyInactive');
    const propertyIds = [...new Set([...owner.agreements, ...owner.partners].map((x) => x.propertyId))];
    return { owner: { id: owner.id, name: owner.name }, company: { name: company!.name, phone: company!.phone, email: company!.email }, propertyIds };
  }

  /** Scope for the finance services: only this owner's properties (an empty list matches nothing). */
  scoped(auth: UserAuth, propertyIds: string[] | null): UserAuth {
    return { ...auth, propertyIds: propertyIds === null ? null : propertyIds.length ? propertyIds : ['-'] };
  }
}

@Controller('portal')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly reports: ReportsService,
    private readonly owners: OwnersFinanceService,
  ) {}

  /** Year view: each property's performance + what the company owes the owner. */
  @Get()
  async overview(@Auth() auth: UserAuth, @Query('year') year?: string) {
    const ctx = await this.portal.context(auth);
    const [report, account] = await Promise.all([
      ctx.propertyIds.length ? this.reports.properties(this.portal.scoped(auth, ctx.propertyIds), { year }) : null,
      this.owners.ownerAccount(this.portal.scoped(auth, null), ctx.owner.id),
    ]);
    const lastPayout = account.payouts.find((p) => p.status === 'ISSUED') ?? null;
    return {
      owner: ctx.owner,
      company: ctx.company,
      year: report?.year ?? (Number(year) || new Date().getUTCFullYear()),
      partialYear: report?.partialYear ?? false,
      properties: (report?.properties ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        units: p.units,
        occupancy: p.occupancy,
        rentIncome: p.rentIncome,
        otherIncome: p.otherIncome,
        expenses: p.expenses,
        noi: p.noi,
        collectionRate: p.collectionRate,
        openWorkOrders: p.openWorkOrders,
      })),
      totals: report?.totals ?? null,
      balance: account.balance,
      lastPayout: lastPayout ? { date: lastPayout.date, amount: lastPayout.amount } : null,
    };
  }

  /** Issued statements that concern this owner. */
  @Get('statements')
  async statements(@Auth() auth: UserAuth) {
    const ctx = await this.portal.context(auth);
    const rows = await this.owners.list(this.portal.scoped(auth, null), { ownerId: ctx.owner.id });
    return rows.filter((s) => s.status === 'ISSUED' && concerns(s, ctx.owner.id));
  }

  @Get('statements/:id')
  async statement(@Auth() auth: UserAuth, @Param('id') id: string) {
    const ctx = await this.portal.context(auth);
    const st = await this.owners.get(this.portal.scoped(auth, null), id);
    if (st.status !== 'ISSUED' || !concerns(st, ctx.owner.id)) throw new NotFoundException('common.notFound');
    return st;
  }

  /** Account: statements credited, payouts, running balance. */
  @Get('account')
  async account(@Auth() auth: UserAuth) {
    const ctx = await this.portal.context(auth);
    return this.owners.ownerAccount(this.portal.scoped(auth, null), ctx.owner.id);
  }
}

// ==================================================================== company side: give an owner a sign-in

const accessRow = (u: { id: string; email: string; isActive: boolean; lastLoginAt: Date | null; mustChangePassword: boolean; createdAt: Date } | null) =>
  u ? { id: u.id, email: u.email, isActive: u.isActive, lastLoginAt: u.lastLoginAt, mustChangePassword: u.mustChangePassword, createdAt: u.createdAt } : null;

@Controller('owners/:id/portal')
export class OwnerPortalAccessController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private async owner(auth: UserAuth, id: string) {
    const owner = await this.prisma.owner.findFirst({ where: { id, companyId: auth.companyId, deletedAt: null }, include: { user: true } });
    if (!owner) throw new NotFoundException('common.notFound');
    return owner;
  }

  @RequirePermission('owners', 'VIEW')
  @Get()
  async get(@Auth() auth: UserAuth, @Param('id') id: string) {
    return { user: accessRow((await this.owner(auth, id)).user) };
  }

  /** Invite: a sign-in for the owner (email + temporary password shown once, changed at the first sign-in). */
  @RequirePermission('owners', 'EDIT')
  @Post()
  async create(@Auth() auth: UserAuth, @Param('id') id: string, @Body() input: unknown) {
    const owner = await this.owner(auth, id);
    if (owner.user && !owner.user.deletedAt) throw new ConflictException({ message: 'portal.alreadyInvited' });
    const email = v.email(v.body(input));
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException({ message: 'auth.emailTaken', field: 'email' });
    const password = temporaryPassword();
    const user = await this.prisma.user.create({
      data: { companyId: auth.companyId, kind: 'OWNER', ownerId: owner.id, name: owner.name, email, passwordHash: await hashPassword(password), mustChangePassword: true },
    });
    await this.activity.log(auth, { action: 'owner.portal.invite', entity: 'Owner', entityId: owner.id, details: { email } });
    return { user: accessRow(user), temporaryPassword: password };
  }

  /** Switch the sign-in off / on (switching off signs the owner out everywhere). */
  @RequirePermission('owners', 'EDIT')
  @Patch()
  async update(@Auth() auth: UserAuth, @Param('id') id: string, @Body() input: unknown) {
    const owner = await this.owner(auth, id);
    if (!owner.user) throw new NotFoundException('common.notFound');
    const isActive = v.optionalBoolean(v.body(input), 'isActive');
    if (isActive === undefined) throw new BadRequestException({ message: 'validation.required', field: 'isActive' });
    const user = await this.prisma.user.update({
      where: { id: owner.user.id },
      data: { isActive, ...(isActive ? {} : { passwordChangedAt: new Date() }) },
    });
    await this.activity.log(auth, { action: isActive ? 'owner.portal.enable' : 'owner.portal.disable', entity: 'Owner', entityId: owner.id });
    return { user: accessRow(user) };
  }

  @RequirePermission('owners', 'EDIT')
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Auth() auth: UserAuth, @Param('id') id: string) {
    const owner = await this.owner(auth, id);
    if (!owner.user) throw new NotFoundException('common.notFound');
    const password = temporaryPassword();
    const user = await this.prisma.user.update({
      where: { id: owner.user.id },
      data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), mustChangePassword: true },
    });
    await this.activity.log(auth, { action: 'owner.portal.resetPassword', entity: 'Owner', entityId: owner.id });
    return { user: accessRow(user), temporaryPassword: password };
  }
}

@Module({
  imports: [FinanceModule],
  controllers: [PortalController, OwnerPortalAccessController],
  providers: [PortalService],
})
export class PortalModule {}
