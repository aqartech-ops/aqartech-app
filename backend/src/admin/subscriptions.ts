import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Patch, Post } from '@nestjs/common';
import type { Subscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { AdminOnly, Auth, type AdminAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';
import { addDays, dayStart, daysLeft, effective, omanDay, renewedEnd, type Cycle, type Status } from './subscription-rules.js';

const HOUR_MS = 60 * 60 * 1000;
export const PAYMENT_METHODS = ['CASH', 'BANK', 'CARD', 'OTHER'] as const;

/** Days a subscription keeps working after its end date (SUBSCRIPTION_GRACE_DAYS, default 3). */
export function graceDays(): number {
  const n = Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? 3);
  return Number.isInteger(n) && n >= 0 && n <= 60 ? n : 3;
}

/** End date as a day "YYYY-MM-DD" (stored at midnight UTC). */
export const endDayOf = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Status of a subscription as it really is today (an ACTIVE one past its end + grace is EXPIRED). */
export function subscriptionState(sub: Pick<Subscription, 'status' | 'endDate'> | null) {
  if (!sub) return null;
  const today = omanDay(new Date());
  const endDay = endDayOf(sub.endDate);
  const eff = effective(sub.status as Status, endDay, today, graceDays());
  return { status: eff.status, inGrace: eff.inGrace, endDay, daysLeft: endDay ? daysLeft(endDay, today) : null, graceDays: graceDays() };
}

/**
 * Subscriptions over time: marks overdue ones EXPIRED (every hour, and on start-up) and writes the history
 * (SubscriptionEvent) of every change — manual until online payment (phase 8).
 */
@Injectable()
export class SubscriptionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.expireOverdue().catch((e) => this.logger.warn(`expiry check: ${(e as Error).message}`));
    this.timer = setInterval(() => this.expireOverdue().catch(() => {}), HOUR_MS);
    (this.timer as { unref?: () => void }).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** ACTIVE subscriptions whose end date + grace days have passed become EXPIRED. */
  async expireOverdue(): Promise<number> {
    const lastWorkingDay = addDays(omanDay(new Date()), -graceDays() - 1);
    const overdue = await this.prisma.subscription.findMany({ where: { status: 'ACTIVE', endDate: { lte: dayStart(lastWorkingDay) } } });
    for (const sub of overdue) {
      await this.prisma.$transaction([
        this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } }),
        this.prisma.subscriptionEvent.create({ data: { subscriptionId: sub.id, companyId: sub.companyId, type: 'EXPIRED', planId: sub.planId, endDate: sub.endDate } }),
      ]);
    }
    if (overdue.length) this.logger.log(`${overdue.length} subscription(s) expired`);
    return overdue.length;
  }

  async record(auth: AdminAuth | null, sub: Subscription, type: string, extra: { amount?: number | null; method?: string | null; reference?: string | null; note?: string | null } = {}) {
    const admin = auth ? await this.prisma.platformAdmin.findUnique({ where: { id: auth.adminId }, select: { name: true } }) : null;
    return this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: sub.id,
        companyId: sub.companyId,
        type,
        planId: sub.planId,
        endDate: sub.endDate,
        amount: extra.amount ?? null,
        method: extra.method ?? null,
        reference: extra.reference ?? null,
        note: extra.note ?? null,
        adminId: auth?.adminId ?? null,
        adminName: admin?.name ?? null,
      },
    });
  }
}

/** One subscriber, in detail, and renewals. (List and plan changes: AdminController.) */
@AdminOnly()
@Controller('admin/companies')
export class AdminSubscribersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly activity: ActivityService,
  ) {}

  @Get(':id')
  async detail(@Param('id') id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      include: {
        subscription: { include: { plan: true, events: { orderBy: { createdAt: 'desc' }, take: 100 } } },
        users: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true, kind: true, isCompanyAdmin: true, isActive: true, createdAt: true } },
        _count: {
          select: {
            properties: { where: { deletedAt: null } },
            units: { where: { deletedAt: null, property: { deletedAt: null } } },
            owners: { where: { deletedAt: null } },
            tenants: { where: { deletedAt: null } },
            leases: { where: { deletedAt: null, status: 'ACTIVE' } },
          },
        },
      },
    });
    if (!company) throw new NotFoundException('common.notFound');
    const plans = await this.prisma.plan.findMany({ select: { id: true, nameAr: true, nameEn: true } });
    const planName = new Map(plans.map((p) => [p.id, p]));
    const staff = company.users.filter((u) => u.kind === 'STAFF').length;
    return {
      id: company.id,
      type: company.type,
      name: company.name,
      ownerName: company.ownerName,
      email: company.email,
      phone: company.phone,
      createdAt: company.createdAt,
      adminNote: company.adminNote,
      users: company.users,
      used: { users: staff, properties: company._count.properties, units: company._count.units, owners: company._count.owners },
      counts: { tenants: company._count.tenants, activeLeases: company._count.leases },
      subscription: company.subscription
        ? {
            ...company.subscription,
            events: company.subscription.events.map((e) => ({ ...e, plan: e.planId ? planName.get(e.planId) ?? null : null })),
            state: subscriptionState(company.subscription),
          }
        : null,
    };
  }

  /** Private note of the platform team about the subscriber. */
  @Patch(':id')
  async note(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const adminNote = v.optionalString(v.body(input), 'adminNote', 2000) ?? null;
    const company = await this.prisma.company.update({ where: { id }, data: { adminNote } });
    await this.activity.log(auth, { action: 'company.note', companyId: id, entity: 'Company', entityId: id });
    return { id: company.id, adminNote: company.adminNote };
  }

  /**
   * Renew: `periods` months (monthly) or years (yearly) from the current end date (or today when it has
   * ended), status ACTIVE, with the manual payment received (amount in baisa, method, reference).
   */
  @HttpCode(200)
  @Post(':id/renew')
  async renew(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const src = v.body(input);
    const sub = await this.prisma.subscription.findUnique({ where: { companyId: id } });
    if (!sub) throw new NotFoundException('common.notFound');
    const periods = v.nonNegativeInt(src, 'periods');
    if (periods < 1 || periods > 36) throw new BadRequestException({ message: 'validation.invalid', field: 'periods' });
    const amount = src.amount === undefined || src.amount === null || src.amount === '' ? null : v.nonNegativeInt(src, 'amount');
    const method = src.method ? v.oneOf(src, 'method', PAYMENT_METHODS) : null;
    const today = omanDay(new Date());
    const end = renewedEnd(endDayOf(sub.endDate), today, sub.billingCycle as Cycle, periods);
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'ACTIVE', endDate: dayStart(end), startDate: sub.startDate ?? dayStart(today) },
    });
    await this.subscriptions.record(auth, updated, 'RENEWED', {
      amount,
      method,
      reference: v.optionalString(src, 'reference', 120) ?? null,
      note: v.optionalString(src, 'note', 500) ?? null,
    });
    await this.activity.log(auth, { action: 'subscription.renew', companyId: id, entity: 'Subscription', entityId: sub.id, details: { periods, end, amount } });
    return { ...updated, state: subscriptionState(updated) };
  }
}
