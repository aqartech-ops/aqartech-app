import { Injectable, Logger } from '@nestjs/common';
import type { Lease, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { today } from '../common/dates.js';
import type { Frequency } from '../leases/schedule.js';
import { LedgerService } from './ledger.service.js';
import { chargeLines } from './journal.js';
import { chargesFromLease, cutAt } from './charges-plan.js';

type Tx = Prisma.TransactionClient;
type LeaseRow = Pick<
  Lease,
  'id' | 'companyId' | 'number' | 'propertyId' | 'unitId' | 'tenantId' | 'startDate' | 'endDate' | 'monthlyRent' | 'discount' | 'deposit' | 'paymentFrequency' | 'dueDay'
>;

/**
 * Rent schedule → ledger (الاستحقاقات).
 *  - When a lease is activated its schedule is saved as RentCharge rows (rent installments + deposit).
 *  - A charge is posted to the ledger on its due date (Dr tenant receivable / Cr rent income or deposits).
 *  - Early termination cancels later periods and re-prices the current one — through reversing entries
 *    when the charge was already posted, never by editing the ledger.
 */
@Injectable()
export class ChargesService {
  private readonly logger = new Logger(ChargesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /** Save the schedule of a lease being activated. Safe to call twice (unique per lease/kind/index). */
  async createForLease(tx: Tx, lease: LeaseRow) {
    const planned = chargesFromLease({ ...lease, paymentFrequency: lease.paymentFrequency as Frequency });
    if (!planned.length) return;
    await tx.rentCharge.createMany({
      data: planned.map((c) => ({
        companyId: lease.companyId,
        leaseId: lease.id,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        tenantId: lease.tenantId,
        kind: c.kind,
        index: c.index,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        dueDate: c.dueDate,
        amount: c.amount,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Early termination (leaveDate = first day no longer paid for). Runs inside the lease's transaction.
   * Returns how many charges were cancelled / re-priced (for the activity log).
   */
  async cutForTermination(tx: Tx, lease: LeaseRow, leaveDate: Date, userId: string | null) {
    const charges = await tx.rentCharge.findMany({ where: { leaseId: lease.id, status: { not: 'CANCELLED' } }, orderBy: { index: 'asc' } });
    const cuts = cutAt(charges, leaveDate, Math.max(0, lease.monthlyRent - lease.discount));
    const byId = new Map(charges.map((c) => [c.id, c]));
    const date = today();
    for (const cut of cuts) {
      const charge = byId.get(cut.id)!;
      const memo = `${lease.number} — ${cut.action === 'cancel' ? 'termination: period cancelled' : 'termination: period prorated'}`;
      if (charge.status === 'POSTED' && charge.entryId) {
        await this.ledger.reverse(tx, lease.companyId, charge.entryId, { date, memo, createdById: userId });
      }
      if (cut.action === 'cancel') {
        await tx.rentCharge.update({ where: { id: charge.id }, data: { status: 'CANCELLED', entryId: null } });
        continue;
      }
      // shorten: re-post the new amount if it was already posted, otherwise just re-price the schedule row
      let entryId: string | null = null;
      if (charge.status === 'POSTED') {
        const entry = await this.ledger.post(tx, {
          companyId: lease.companyId,
          date,
          type: 'RENT_CHARGE',
          memo: `${lease.number} — #${charge.index} (prorated)`,
          leaseId: lease.id,
          chargeId: charge.id,
          createdById: userId,
          lines: chargeLines('RENT', cut.amount, this.dims(charge)),
        });
        entryId = entry.id;
      }
      await tx.rentCharge.update({ where: { id: charge.id }, data: { amount: cut.amount, periodEnd: cut.periodEnd, entryId } });
    }
    return { cancelled: cuts.filter((c) => c.action === 'cancel').length, prorated: cuts.filter((c) => c.action === 'shorten').length };
  }

  /**
   * Bring the company's books up to date: save schedules missing for older leases, then post every
   * charge whose due date has arrived. Cheap when there is nothing to do; called before financial reads.
   */
  async sync(companyId: string) {
    await this.backfill(companyId);
    const due = await this.prisma.rentCharge.findMany({
      where: { companyId, status: 'SCHEDULED', dueDate: { lte: today() }, lease: { deletedAt: null, status: { not: 'DRAFT' } } },
      orderBy: [{ dueDate: 'asc' }, { index: 'asc' }],
      include: { lease: { select: { number: true } } },
    });
    for (const charge of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // claim the row first: a parallel request that already posted it makes this a no-op
          const claimed = await tx.rentCharge.updateMany({ where: { id: charge.id, status: 'SCHEDULED' }, data: { status: 'POSTED' } });
          if (claimed.count === 0) return;
          const entry = await this.ledger.post(tx, {
            companyId,
            date: charge.dueDate,
            type: charge.kind === 'RENT' ? 'RENT_CHARGE' : 'DEPOSIT_CHARGE',
            memo: charge.kind === 'RENT' ? `${charge.lease.number} — #${charge.index}` : `${charge.lease.number} — deposit`,
            leaseId: charge.leaseId,
            chargeId: charge.id,
            lines: chargeLines(charge.kind, charge.amount, this.dims(charge)),
          });
          await tx.rentCharge.update({ where: { id: charge.id }, data: { entryId: entry.id } });
        });
      } catch (error) {
        this.logger.error(`Failed to post charge ${charge.id}`, error as Error);
      }
    }
  }

  /** Leases activated before the finance phase have no schedule rows yet: create them (and apply early terminations). */
  private async backfill(companyId: string) {
    const leases = await this.prisma.lease.findMany({
      where: { companyId, deletedAt: null, status: { not: 'DRAFT' }, charges: { none: {} } },
    });
    for (const lease of leases) {
      await this.prisma.$transaction(async (tx) => {
        await this.createForLease(tx, lease);
        if (lease.terminatedAt) await this.cutForTermination(tx, lease, lease.terminatedAt, null);
      });
    }
  }

  private dims(c: { propertyId: string; unitId: string; leaseId: string; tenantId: string }) {
    return { propertyId: c.propertyId, unitId: c.unitId, leaseId: c.leaseId, tenantId: c.tenantId };
  }
}
