import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import type { UserAuth } from '../common/auth-context.js';
import { today } from '../common/dates.js';
import * as v from '../common/validate.js';
import { ChargesService } from './charges.service.js';
import { LedgerService } from './ledger.service.js';
import { ACCOUNTS, naturalBalance, type Account } from './journal.js';

const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)); // m: 0-11
const key = (d: Date) => d.toISOString().slice(0, 7);

/**
 * Month close (إقفال الشهر). Closing a month locks every date up to its last day:
 *  - documents dated in a locked month are refused;
 *  - corrections (voids, reversals) and automatic postings land in the first open day,
 *    so they show in the current month and closed figures never change.
 * Only the latest close can be reopened, by the account owner.
 */
@Injectable()
export class ClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly ledger: LedgerService,
    private readonly charges: ChargesService,
  ) {}

  async status(auth: UserAuth) {
    const closes = await this.prisma.periodClose.findMany({
      where: { companyId: auth.companyId },
      orderBy: { closedAt: 'desc' },
      take: 24,
    });
    const active = closes.filter((c) => !c.reopenedAt).sort((a, b) => b.lockedUntil.getTime() - a.lockedUntil.getTime());
    const lockedUntil = active[0]?.lockedUntil ?? null;
    const now = today();
    const lastFull = monthEnd(now.getUTCFullYear(), now.getUTCMonth() - 1); // end of last month
    // suggest the month right after the lock (or last month when nothing is closed yet)
    const next = lockedUntil ? monthEnd(lockedUntil.getUTCFullYear(), lockedUntil.getUTCMonth() + 1) : lastFull;
    return {
      lockedUntil,
      nextMonth: next <= lastFull ? key(next) : null,
      canReopen: auth.isCompanyAdmin && !!active[0],
      history: closes.map((c) => ({ id: c.id, month: c.month, closedAt: c.closedAt, reopenedAt: c.reopenedAt, snapshot: c.snapshot })),
    };
  }

  async close(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const month = v.requiredString(src, 'month', 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException({ message: 'validation.invalid', field: 'month' });
    const [y, m] = month.split('-').map(Number);
    const end = monthEnd(y, m - 1);
    const now = today();
    if (end >= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) throw new BadRequestException('period.notOver');
    const locked = await this.ledger.lockedUntil(this.prisma, auth.companyId);
    if (locked && end <= locked) throw new BadRequestException('period.alreadyClosed');

    // everything due up to the end of the month must be on the books before it is frozen
    await this.charges.sync(auth.companyId);
    const groups = await this.prisma.journalLine.groupBy({
      by: ['account'],
      where: { companyId: auth.companyId, entry: { date: { lte: end } } },
      _sum: { amount: true },
    });
    const balances = Object.fromEntries(ACCOUNTS.map((a) => [a, 0])) as Record<Account, number>;
    for (const g of groups) balances[g.account] = naturalBalance(g.account, g._sum.amount ?? 0);
    const close = await this.prisma.periodClose.create({
      data: {
        companyId: auth.companyId,
        month,
        lockedUntil: end,
        snapshot: { balances, total: groups.reduce((s, g) => s + (g._sum.amount ?? 0), 0) } as Prisma.InputJsonValue,
        closedById: auth.userId,
        notes: v.optionalString(src, 'notes', 500) ?? null,
      },
    });
    await this.activity.log(auth, { action: 'period.close', entity: 'PeriodClose', entityId: close.id, details: { month } });
    return this.status(auth);
  }

  /** Reopen the latest close (owner of the account only) — logged. */
  async reopen(auth: UserAuth, input: unknown) {
    if (!auth.isCompanyAdmin) throw new ForbiddenException('auth.forbidden');
    const reason = v.requiredString(v.body(input ?? {}), 'reason', 500);
    const latest = await this.prisma.periodClose.findFirst({ where: { companyId: auth.companyId, reopenedAt: null }, orderBy: { lockedUntil: 'desc' } });
    if (!latest) throw new BadRequestException('period.nothingToReopen');
    await this.prisma.periodClose.update({ where: { id: latest.id }, data: { reopenedAt: new Date(), reopenedById: auth.userId, notes: reason } });
    await this.activity.log(auth, { action: 'period.reopen', entity: 'PeriodClose', entityId: latest.id, details: { month: latest.month, reason } });
    return this.status(auth);
  }
}
