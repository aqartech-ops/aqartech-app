// Report formulas (التقارير) as pure functions — unit-tested. Dates are UTC midnights; money is baisa.

const DAY = 86_400_000;

/** Inclusive number of days in [from, to] (0 if empty). */
export function daysIn(from: Date, to: Date): number {
  return to < from ? 0 : Math.round((to.getTime() - from.getTime()) / DAY) + 1;
}

/** Last day a lease is actually occupied: the day before an early termination, else its end date. */
export function effectiveEnd(lease: { endDate: Date; terminatedAt: Date | null }): Date {
  if (lease.terminatedAt && lease.terminatedAt <= lease.endDate) return new Date(lease.terminatedAt.getTime() - DAY);
  return lease.endDate;
}

/**
 * Occupancy over a window: occupied unit-days ÷ available unit-days.
 * A unit is available from max(window start, its creation date). Overlapping leases on a unit count once.
 */
export function occupancy(
  units: { id: string; availableFrom: Date }[],
  leases: { unitId: string; startDate: Date; endDate: Date; terminatedAt: Date | null }[],
  from: Date,
  to: Date,
): { occupiedDays: number; availableDays: number; vacantDays: number; rate: number | null } {
  let occupiedDays = 0;
  let availableDays = 0;
  for (const u of units) {
    const start = u.availableFrom > from ? u.availableFrom : from;
    if (start > to) continue;
    availableDays += daysIn(start, to);
    // merge this unit's lease intervals inside [start, to]
    const spans = leases
      .filter((l) => l.unitId === u.id)
      .map((l) => [l.startDate > start ? l.startDate : start, effectiveEnd(l) < to ? effectiveEnd(l) : to] as const)
      .filter(([a, b]) => b >= a)
      .sort((x, y) => x[0].getTime() - y[0].getTime());
    let curA: Date | null = null;
    let curB: Date | null = null;
    for (const [a, b] of spans) {
      if (curA && curB && a.getTime() <= curB.getTime() + DAY) {
        if (b > curB) curB = b;
      } else {
        if (curA && curB) occupiedDays += daysIn(curA, curB);
        curA = a;
        curB = b;
      }
    }
    if (curA && curB) occupiedDays += daysIn(curA, curB);
  }
  return {
    occupiedDays,
    availableDays,
    vacantDays: availableDays - occupiedDays,
    rate: availableDays ? Math.round((occupiedDays * 1000) / availableDays) / 10 : null,
  };
}

/** a ÷ b as a percentage with one decimal; null when b is 0 or missing. */
export function pct(a: number, b: number | null | undefined): number | null {
  if (!b) return null;
  return Math.round((a * 1000) / b) / 10;
}

/** Renewal rate among leases that reached their end in the window: renewed ÷ ended. */
export function renewalRate(ended: { renewed: boolean }[]): number | null {
  if (!ended.length) return null;
  return pct(ended.filter((l) => l.renewed).length, ended.length);
}

/** Month keys "2026-01" … covering [from, to]. */
export function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  while (y < to.getUTCFullYear() || (y === to.getUTCFullYear() && m <= to.getUTCMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return out;
}
