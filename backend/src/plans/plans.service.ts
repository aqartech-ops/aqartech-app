import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export const LIMIT_KEYS = ['properties', 'units', 'users', 'owners'] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
export type PlanLimits = Partial<Record<LimitKey, number | null>>;

export function readLimits(plan: Pick<Plan, 'limits'>): PlanLimits {
  const raw = (plan.limits && typeof plan.limits === 'object' ? plan.limits : {}) as Record<string, unknown>;
  const result: PlanLimits = {};
  for (const key of LIMIT_KEYS) {
    const value = raw[key];
    result[key] = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null; // null = unlimited
  }
  return result;
}

/** Public shape of a plan (what the registration screen shows). */
export function publicPlan(plan: Plan) {
  return {
    id: plan.id,
    code: plan.code,
    nameEn: plan.nameEn,
    nameAr: plan.nameAr,
    descriptionEn: plan.descriptionEn,
    descriptionAr: plan.descriptionAr,
    audience: plan.audience,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    limits: readLimits(plan),
    features: plan.features,
  };
}

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
    });
    return plans.map(publicPlan);
  }

  /** Current usage vs. plan limits for a company. */
  async usage(companyId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
    const limits = subscription ? readLimits(subscription.plan) : {};
    const [users, owners, properties, units] = await Promise.all([
      this.prisma.user.count({ where: { companyId, kind: 'STAFF', deletedAt: null } }),
      this.prisma.owner.count({ where: { companyId, deletedAt: null } }),
      this.prisma.property.count({ where: { companyId, deletedAt: null } }),
      this.prisma.unit.count({ where: { companyId, deletedAt: null, property: { deletedAt: null } } }),
    ]);
    const used: Record<LimitKey, number> = { users, owners, properties, units };
    return { status: subscription?.status ?? null, limits, used };
  }

  /** Throws if adding `count` more `key` would exceed the plan, or if the subscription is not active. */
  async assertCanAdd(companyId: string, key: LimitKey, count = 1): Promise<void> {
    const { status, limits, used } = await this.usage(companyId);
    if (status !== 'ACTIVE') throw new ForbiddenException('subscription.inactive');
    const limit = limits[key];
    if (limit !== null && limit !== undefined && used[key] + count > limit) {
      throw new ForbiddenException({ message: 'plan.limitReached', limit: key, max: limit });
    }
  }
}
