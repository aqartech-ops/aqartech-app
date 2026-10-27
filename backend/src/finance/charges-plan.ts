// Pure rules for the rent schedule saved from a lease (RentCharge rows), and for cutting it when a
// lease is terminated early. No database access here, so every rule is unit-tested.
import { buildSchedule, rentForSpan, type Frequency } from '../leases/schedule.js';

const DAY = 86_400_000;

export type LeaseTerms = {
  startDate: Date;
  endDate: Date;
  monthlyRent: number;
  discount: number;
  deposit: number;
  paymentFrequency: Frequency;
  dueDay: number;
};

export type PlannedCharge = {
  kind: 'RENT' | 'DEPOSIT';
  index: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  dueDate: Date;
  amount: number;
};

/** Rent installments + the deposit (due on the start date, index 0). Zero amounts are skipped. */
export function chargesFromLease(lease: LeaseTerms): PlannedCharge[] {
  const rent = buildSchedule(lease)
    .filter((x) => x.amount > 0)
    .map((x) => ({ kind: 'RENT' as const, index: x.index, periodStart: x.periodStart, periodEnd: x.periodEnd, dueDate: x.dueDate, amount: x.amount }));
  const deposit: PlannedCharge[] =
    lease.deposit > 0 ? [{ kind: 'DEPOSIT', index: 0, periodStart: null, periodEnd: null, dueDate: lease.startDate, amount: lease.deposit }] : [];
  return [...deposit, ...rent];
}

export type ExistingCharge = { id: string; kind: 'RENT' | 'DEPOSIT'; periodStart: Date | null; periodEnd: Date | null; amount: number };

export type Cut =
  | { id: string; action: 'cancel' }
  | { id: string; action: 'shorten'; amount: number; periodEnd: Date };

/**
 * Early termination on `leaveDate` (the first day the tenant no longer pays for):
 *  - periods starting on/after leaveDate are cancelled;
 *  - the period containing leaveDate is shortened and re-priced by days (same rule as the schedule);
 *  - earlier periods and the deposit are untouched.
 */
export function cutAt(charges: ExistingCharge[], leaveDate: Date, monthlyNet: number): Cut[] {
  const cuts: Cut[] = [];
  for (const c of charges) {
    if (c.kind !== 'RENT' || !c.periodStart || !c.periodEnd) continue;
    if (c.periodStart >= leaveDate) {
      cuts.push({ id: c.id, action: 'cancel' });
    } else if (c.periodEnd >= leaveDate) {
      const amount = rentForSpan(c.periodStart, leaveDate, monthlyNet);
      if (amount <= 0) cuts.push({ id: c.id, action: 'cancel' });
      else if (amount !== c.amount) cuts.push({ id: c.id, action: 'shorten', amount, periodEnd: new Date(leaveDate.getTime() - DAY) });
    }
  }
  return cuts;
}
