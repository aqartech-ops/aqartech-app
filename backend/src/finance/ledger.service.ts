import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { EntryType, Prisma } from '@prisma/client';
import { assertBalanced, reverseLines, type Line } from './journal.js';

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
    const number = await this.nextNumber(tx, input.companyId, 'journal', input.date.getUTCFullYear(), 'J', 6);
    return tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        number,
        date: input.date,
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
    const number = await this.nextNumber(tx, companyId, 'journal', opts.date.getUTCFullYear(), 'J', 6);
    return tx.journalEntry.create({
      data: {
        companyId,
        number,
        date: opts.date,
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
