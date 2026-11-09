// Subscriber management (إدارة المشتركين) — pure rules, unit-tested.
// Dates are compared as Oman calendar days: a subscription "ending 2026-03-31" works all of that day in Oman.

const DAY_MS = 86_400_000;
const OMAN_OFFSET_MS = 4 * 60 * 60 * 1000;

export type Cycle = 'MONTHLY' | 'YEARLY';
export type Status = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';

/** "YYYY-MM-DD" in Oman. */
export function omanDay(d: Date): string {
  return new Date(d.getTime() + OMAN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight UTC of a day "YYYY-MM-DD" (how end dates are stored). */
export function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Add whole months, keeping the day when it exists (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * New end day of a renewal: `periods` months (monthly) or years (yearly), counted from the current end day
 * when the subscription is still running, otherwise from today. The day before the anniversary is the last day.
 */
export function renewedEnd(currentEnd: string | null, today: string, cycle: Cycle, periods: number): string {
  const from = currentEnd && currentEnd >= today ? addDays(currentEnd, 1) : today;
  return addDays(addMonths(from, cycle === 'YEARLY' ? 12 * periods : periods), -1);
}

export function addDays(day: string, days: number): string {
  return new Date(dayStart(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from today to the end day (0 = ends today, negative = ended). */
export function daysLeft(endDay: string, today: string): number {
  return Math.round((dayStart(endDay).getTime() - dayStart(today).getTime()) / DAY_MS);
}

/**
 * What a subscription really is now: an ACTIVE one whose end day is past (plus the grace days) counts as EXPIRED.
 * `inGrace`: ended, but still working during the grace days.
 */
export function effective(status: Status, endDay: string | null, today: string, graceDays: number): { status: Status; inGrace: boolean } {
  if (status !== 'ACTIVE' || !endDay) return { status, inGrace: false };
  const left = daysLeft(endDay, today);
  if (left >= 0) return { status, inGrace: false };
  if (-left <= graceDays) return { status: 'ACTIVE', inGrace: true };
  return { status: 'EXPIRED', inGrace: false };
}

/** Event recorded for a manual change of the subscription. */
export function eventType(before: { status: Status; planId: string }, after: { status?: Status; planId?: string }): string {
  if (after.status && after.status !== before.status) {
    if (after.status === 'ACTIVE') return before.status === 'SUSPENDED' ? 'RESUMED' : 'ACTIVATED';
    return after.status; // SUSPENDED | CANCELLED | EXPIRED | PENDING
  }
  if (after.planId && after.planId !== before.planId) return 'PLAN_CHANGED';
  return 'UPDATED';
}
