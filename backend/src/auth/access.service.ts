import { Injectable } from '@nestjs/common';
import type { Plan, Role, Subscription, User } from '@prisma/client';
import {
  ALWAYS_ON,
  SECTIONS,
  LEVEL_RANK,
  normalizePermissions,
  type AccessLevel,
  type SectionKey,
} from '../common/sections.js';

type UserWithAccessData = User & {
  role: Role | null;
  company: { subscription: (Subscription & { plan: Plan }) | null };
};

/**
 * Effective access of a company user to each section:
 *   plan unlocks the section (only while the subscription is ACTIVE)
 *   ∩ the user's role level (the subscriber's main account gets EDIT everywhere)
 * Dashboard and settings are always at least VIEW so nobody is locked out.
 */
@Injectable()
export class AccessService {
  compute(user: UserWithAccessData): Record<SectionKey, AccessLevel> {
    const subscription = user.company.subscription;
    const active = subscription?.status === 'ACTIVE';
    const planSections = new Set<string>(active ? subscription!.plan.features : []);

    const roleLevels = user.isCompanyAdmin
      ? null
      : normalizePermissions(user.role && !user.role.deletedAt ? user.role.permissions : {});

    const result = {} as Record<SectionKey, AccessLevel>;
    for (const section of SECTIONS) {
      let level: AccessLevel = 'HIDDEN';
      if (planSections.has(section)) {
        level = roleLevels ? roleLevels[section] : 'EDIT';
      }
      if (ALWAYS_ON.includes(section) && LEVEL_RANK[level] < LEVEL_RANK.VIEW) {
        level = 'VIEW';
      }
      // Linked property owners are read-only everywhere.
      if (user.kind === 'OWNER' && level === 'EDIT') level = 'VIEW';
      result[section] = level;
    }
    if (user.isCompanyAdmin) result.settings = 'EDIT';
    return result;
  }
}
