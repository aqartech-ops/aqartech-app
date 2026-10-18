// Rent schedule (جدول الاستحقاقات) of a lease — a pure function, the single source used by the API now
// and by the ledger in phase 4. Dates are UTC midnights; amounts are integer baisa.

export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';

export const MONTHS_PER: Record<Frequency, number> = { MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6, ANNUAL: 12 };

export type ScheduleInput = {
  startDate: Date;
  endDate: Date; // inclusive
  monthlyRent: number; // baisa
  discount?: number; // baisa per month
  paymentFrequency: Frequency;
  dueDay?: number; // 1-28
};

export type Installment = {
  index: number; // 1-based
  periodStart: Date;
  periodEnd: Date; // inclusive
  dueDate: Date;
  amount: number; // baisa
  partial: boolean; // shorter than a full period (prorated)
};

const DAY = 86_400_000;

export function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Same day-of-month `n` months later, clamped (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, n: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + n;
  const target = new Date(Date.UTC(y, m, 1));
  const day = Math.min(date.getUTCDate(), daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
  return utcDate(target.getUTCFullYear(), target.getUTCMonth(), day);
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const startOfDay = (d: Date) => utcDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Rent for [from, toExclusive): whole months at the monthly rate, leftover days prorated on that month's length. */
export function rentForSpan(from: Date, toExclusive: Date, monthly: number): number {
  let months = 0;
  while (addMonths(from, months + 1) <= toExclusive) months += 1;
  const rest = addMonths(from, months);
  const leftoverDays = Math.round((toExclusive.getTime() - rest.getTime()) / DAY);
  const monthLength = daysInMonth(rest.getUTCFullYear(), rest.getUTCMonth());
  return monthly * months + Math.round((monthly * leftoverDays) / monthLength);
}

export function buildSchedule(input: ScheduleInput): Installment[] {
  const start = startOfDay(input.startDate);
  const end = startOfDay(input.endDate);
  if (end < start) return [];
  const step = MONTHS_PER[input.paymentFrequency];
  const net = Math.max(0, input.monthlyRent - (input.discount ?? 0));
  const dueDay = Math.min(Math.max(input.dueDay ?? 1, 1), 28);

  const list: Installment[] = [];
  for (let i = 0; i < 1200; i += 1) {
    const periodStart = addMonths(start, i * step);
    if (periodStart > end) break;
    const naturalNext = addMonths(start, (i + 1) * step);
    const nextStart = naturalNext > addDays(end, 1) ? addDays(end, 1) : naturalNext;
    const periodEnd = addDays(nextStart, -1);
    const partial = nextStart < naturalNext;
    const amount = partial ? rentForSpan(periodStart, nextStart, net) : net * step;
    const dueDate =
      i === 0
        ? periodStart
        : utcDate(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), Math.min(dueDay, daysInMonth(periodStart.getUTCFullYear(), periodStart.getUTCMonth())));
    list.push({ index: i + 1, periodStart, periodEnd, dueDate, amount, partial });
  }
  return list;
}

export function scheduleTotal(list: Installment[]): number {
  return list.reduce((sum, x) => sum + x.amount, 0);
}
