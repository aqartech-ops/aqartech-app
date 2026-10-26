import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { AdminOnly, Auth, type AdminAuth } from '../common/auth-context.js';
import { ALWAYS_ON, SECTIONS, isSectionKey } from '../common/sections.js';
import { LIMIT_KEYS, publicPlan } from '../plans/plans.service.js';
import * as v from '../common/validate.js';

/**
 * Platform admin API (لوحة الأدمن). Phase 1 covers plans and subscriber activation;
 * the full admin panel (custom fields, sections, buttons) comes in phase 2.
 */
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  // ---------- Plans (الباقات) — everything editable, nothing hard-coded ----------

  /** What a plan can contain: sections (always-on ones cannot be removed) and limit keys. */
  @Get('plan-options')
  planOptions() {
    return { sections: SECTIONS, alwaysOn: ALWAYS_ON, limitKeys: LIMIT_KEYS };
  }

  @Get('plans')
  async plans() {
    const plans = await this.prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    });
    return plans.map((p) => ({ ...publicPlan(p), isActive: p.isActive, sortOrder: p.sortOrder, subscribers: p._count.subscriptions }));
  }

  @Post('plans')
  async createPlan(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const data = this.planData(v.body(input), true) as unknown as Prisma.PlanCreateInput;
    if (await this.prisma.plan.findUnique({ where: { code: data.code } })) {
      throw new BadRequestException({ message: 'plan.codeTaken', field: 'code' });
    }
    const plan = await this.prisma.plan.create({ data });
    await this.activity.log(auth, { action: 'plan.create', entity: 'Plan', entityId: plan.id, details: data });
    return publicPlan(plan);
  }

  @Patch('plans/:id')
  async updatePlan(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    await this.findPlan(id);
    const data = this.planData(v.body(input), false);
    const plan = await this.prisma.plan.update({ where: { id }, data });
    await this.activity.log(auth, { action: 'plan.update', entity: 'Plan', entityId: id, details: data });
    return publicPlan(plan);
  }

  /** Plans with subscribers are deactivated (hidden from sign-up) instead of deleted. */
  @Delete('plans/:id')
  async removePlan(@Auth() auth: AdminAuth, @Param('id') id: string) {
    await this.findPlan(id);
    const subscribers = await this.prisma.subscription.count({ where: { planId: id } });
    if (subscribers > 0) {
      await this.prisma.plan.update({ where: { id }, data: { isActive: false } });
    } else {
      await this.prisma.plan.delete({ where: { id } });
    }
    await this.activity.log(auth, { action: subscribers ? 'plan.deactivate' : 'plan.delete', entity: 'Plan', entityId: id });
    return { ok: true, deactivated: subscribers > 0 };
  }

  // ---------- Subscribers (المشتركون) ----------

  @Get('companies')
  async companies() {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: { include: { plan: { select: { id: true, code: true, nameEn: true, nameAr: true } } } },
        _count: {
          select: {
            users: { where: { deletedAt: null } },
            properties: { where: { deletedAt: null } },
            units: { where: { deletedAt: null, property: { deletedAt: null } } },
            owners: { where: { deletedAt: null } },
          },
        },
      },
    });
    const staff = await this.prisma.user.groupBy({ by: ['companyId'], where: { kind: 'STAFF', deletedAt: null }, _count: { _all: true } });
    const staffOf = new Map(staff.map((g) => [g.companyId, g._count._all]));
    return companies.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      ownerName: c.ownerName,
      email: c.email,
      phone: c.phone,
      createdAt: c.createdAt,
      users: c._count.users,
      // current usage, compared with the plan limits when the admin changes the plan
      used: { users: staffOf.get(c.id) ?? 0, properties: c._count.properties, units: c._count.units, owners: c._count.owners },
      subscription: c.subscription,
    }));
  }

  /** Activate / suspend / change plan — manual until online payment (phase 8). */
  @Patch('companies/:id/subscription')
  async updateSubscription(@Auth() auth: AdminAuth, @Param('id') companyId: string, @Body() input: unknown) {
    const src = v.body(input);
    const existing = await this.prisma.subscription.findUnique({ where: { companyId } });
    if (!existing) throw new NotFoundException('common.notFound');

    const status = src.status !== undefined
      ? v.oneOf(src, 'status', ['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const)
      : undefined;
    let planId: string | undefined;
    if (src.planId !== undefined) {
      planId = (await this.findPlan(v.requiredString(src, 'planId', 60))).id;
    }
    const date = (field: string) => {
      const value = src[field];
      if (value === undefined) return undefined;
      if (value === null) return null;
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) throw new BadRequestException({ message: 'validation.date', field });
      return d;
    };

    const subscription = await this.prisma.subscription.update({
      where: { companyId },
      data: {
        status,
        planId,
        billingCycle: src.billingCycle !== undefined ? v.oneOf(src, 'billingCycle', ['MONTHLY', 'YEARLY'] as const) : undefined,
        startDate: date('startDate') ?? (status === 'ACTIVE' && !existing.startDate ? new Date() : undefined),
        endDate: date('endDate'),
      },
      include: { plan: true },
    });
    await this.activity.log(auth, {
      action: 'subscription.update',
      companyId,
      entity: 'Subscription',
      entityId: subscription.id,
      details: src,
    });
    return subscription;
  }

  // ---------- helpers ----------

  private async findPlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('common.notFound');
    return plan;
  }

  private planData(src: Record<string, unknown>, creating: boolean): Prisma.PlanUpdateInput {
    const has = (k: string) => creating || src[k] !== undefined;
    const data: Prisma.PlanUpdateInput = {};
    if (has('code')) {
      const code = v.requiredString(src, 'code', 40).toLowerCase();
      if (!/^[a-z0-9-]+$/.test(code)) throw new BadRequestException({ message: 'validation.code', field: 'code' });
      data.code = code;
    }
    if (has('nameEn')) data.nameEn = v.requiredString(src, 'nameEn', 80);
    if (has('nameAr')) data.nameAr = v.requiredString(src, 'nameAr', 80);
    if (src.descriptionEn !== undefined) data.descriptionEn = v.optionalString(src, 'descriptionEn', 500) ?? null;
    if (src.descriptionAr !== undefined) data.descriptionAr = v.optionalString(src, 'descriptionAr', 500) ?? null;
    if (has('audience')) data.audience = v.oneOf(src, 'audience', ['COMPANY', 'INDIVIDUAL', 'ANY'] as const, 'ANY');
    if (has('priceMonthly')) data.priceMonthly = v.nonNegativeInt(src, 'priceMonthly', 0);
    if (has('priceYearly')) data.priceYearly = v.nonNegativeInt(src, 'priceYearly', 0);
    if (src.sortOrder !== undefined) data.sortOrder = v.nonNegativeInt(src, 'sortOrder');
    if (src.isActive !== undefined) data.isActive = v.optionalBoolean(src, 'isActive');
    if (has('limits')) {
      const raw = (src.limits && typeof src.limits === 'object' ? src.limits : {}) as Record<string, unknown>;
      const limits: Record<string, number | null> = {};
      for (const key of LIMIT_KEYS) {
        const value = raw[key];
        if (value === undefined || value === null) limits[key] = null;
        else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) limits[key] = value;
        else throw new BadRequestException({ message: 'validation.nonNegativeInt', field: `limits.${key}` });
      }
      data.limits = limits;
    }
    if (has('features')) {
      const features = Array.isArray(src.features) ? src.features.filter((f): f is string => typeof f === 'string') : [];
      const unknown = features.filter((f) => !isSectionKey(f));
      if (unknown.length) throw new BadRequestException({ message: 'plan.unknownFeature', field: 'features', unknown });
      data.features = [...new Set([...ALWAYS_ON, ...features])];
    }
    return data;
  }
}
