// Calendar dates are stored as UTC midnights (2026-03-01T00:00:00Z = 1 March).
// "Today" is the calendar date in Oman (UTC+4, no daylight saving), so a charge due on 1 March
// becomes due at midnight in Muscat — not at 4 a.m.
const OMAN_OFFSET_MS = 4 * 60 * 60 * 1000;
export const DAY_MS = 86_400_000;

export function today(now = new Date()): Date {
  const local = new Date(now.getTime() + OMAN_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** Whole days from `from` to `to` (both calendar dates). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** First day of the month of `date`. */
export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
