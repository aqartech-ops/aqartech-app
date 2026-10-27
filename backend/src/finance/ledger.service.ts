import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { EntryType, Prisma } from '@prisma/client';
import { assertBalanced, postingDate, reverseLines, type Line } from './journal.js';

type Tx = Prisma.TransactionClient;

export type PostInput = {
  companyId: string;
  date: Date;
  type: EntryType;
  memo?: string | null;
  leaseId?: string | null;
  chargeId?: string | null;
  createdById?: string | null;
  lines: Line[];
  /** For automatic postings: a date inside a closed month moves to the first open day instead of failing. */
  autoRoll?: boolean;
};


/**
 * The ledger (دفتر القيود). The ONLY place that writes journal entries.
 * Always called inside a transaction together with the business change it records,
 * so a document and its accounting can never get out of step.
 */
@Injectable()
export class LedgerService {
  /** Validates (balanced, integer baisa) and writes one entry with its lines. */
  async post(tx: Tx, input: PostInput) {
    assertBalanced(input.lines);
    const date = await this.openDate(tx, input.companyId, input.date, input.autoRoll ?? false);
    const number = await this.nextNumber(tx, input.companyId, 'journal', date.getUTCFullYear(), 'J', 6);
    return tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        number,
        date,
        type: input.type,
        memo: input.memo ?? null,
        leaseId: input.leaseId ?? null,
        chargeId: input.chargeId ?? null,
        createdById: input.createdById ?? null,
        lines: {
          create: input.lines.map((l) => ({
            companyId: input.companyId,
            account: l.account,
            amount: l.amount,
            propertyId: l.propertyId ?? null,
            unitId: l.unitId ?? null,
            leaseId: l.leaseId ?? null,
            tenantId: l.tenantId ?? null,
            ownerId: l.ownerId ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  }

  /** Cancels an entry by posting its exact opposite (قيد عكسي). An entry can be reversed only once. */
  async reverse(tx: Tx, companyId: string, entryId: string, opts: { date: Date; memo?: string | null; createdById?: string | null }) {
    const original = await tx.journalEntry.findFirst({ where: { id: entryId, companyId }, include: { lines: true, reversedBy: true } });
    if (!original) throw new NotFoundException('common.notFound');
    if (original.reversedBy || original.type === 'REVERSAL') throw new BadRequestException('ledger.alreadyReversed');
    const lines: Line[] = original.lines.map((l) => ({
      account: l.account,
      amount: l.amount,
      propertyId: l.propertyId,
      unitId: l.unitId,
      leaseId: l.leaseId,
      tenantId: l.tenantId,
      ownerId: l.ownerId,
    }));
    assertBalanced(lines);
    // a correction of a closed month always lands in the open period (it shows in the current month)
    const date = await this.openDate(tx, companyId, opts.date, true);
    const number = await this.nextNumber(tx, companyId, 'journal', date.getUTCFullYear(), 'J', 6);
    return tx.journalEntry.create({
      data: {
        companyId,
        number,
        date,
        type: 'REVERSAL',
        memo: opts.memo ?? null,
        leaseId: original.leaseId,
        chargeId: original.chargeId,
        reversesId: original.id,
        createdById: opts.createdById ?? null,
        lines: {
          create: reverseLines(lines).map((l) => ({
            companyId,
            account: l.account,
            amount: l.amount,
            propertyId: l.propertyId ?? null,
            unitId: l.unitId ?? null,
            leaseId: l.leaseId ?? null,
            tenantId: l.tenantId ?? null,
            ownerId: l.ownerId ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  }

  /** Last locked day (end of the latest closed month that was not reopened), or null. */
  async lockedUntil(tx: Tx | Pick<Tx, 'periodClose'>, companyId: string): Promise<Date | null> {
    const close = await tx.periodClose.findFirst({ where: { companyId, reopenedAt: null }, orderBy: { lockedUntil: 'desc' }, select: { lockedUntil: true } });
    return close?.lockedUntil ?? null;
  }

  /** A date that may be posted: unchanged when open; in a closed month → error, or the first open day when `roll`. */
  private async openDate(tx: Tx, companyId: string, date: Date, roll: boolean): Promise<Date> {
    const locked = await this.lockedUntil(tx, companyId);
    const result = postingDate(date, locked, roll);
    if (!result) throw new BadRequestException({ message: 'period.closed', field: 'date', lockedUntil: locked });
    return result;
  }

  /** Gap-free sequential number per company and year, e.g. J-2026-000001. The counter row lock serializes writers. */
  async nextNumber(tx: Tx, companyId: string, key: string, year: number, prefix: string, digits: number) {
    const counter = await tx.counter.upsert({
      where: { companyId_key: { companyId, key: `${key}:${year}` } },
      create: { companyId, key: `${key}:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `${prefix}-${year}-${String(counter.value).padStart(digits, '0')}`;
  }
}
