// Owner statement rules (كشف حساب المالك) as pure functions — unit-tested.
import type { Line } from './journal.js';

export type Kind = 'RENT' | 'DEPOSIT' | 'FEE';

/**
 * Spread what a tenant has paid on a lease over its charges, oldest first (deposit is due on the
 * start date so it is settled first). Returns how much of the payments went to each kind.
 * Charges must be the lease's non-cancelled charges; `paid` the net payments so far (≥ 0).
 */
export function allocateByKind(charges: { kind: Kind; amount: number; dueDate: Date; index: number }[], paid: number): Record<Kind, number> {
  const out: Record<Kind, number> = { RENT: 0, DEPOSIT: 0, FEE: 0 };
  let remaining = Math.max(0, paid);
  const ordered = [...charges].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime() || (a.kind === 'DEPOSIT' ? -1 : b.kind === 'DEPOSIT' ? 1 : 0) || a.index - b.index,
  );
  for (const c of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(c.amount, remaining);
    out[c.kind] += take;
    remaining -= take;
  }
  // anything beyond all charges is an advance; it counts as rent once rent charges exist for it
  out.RENT += remaining;
  return out;
}

/** Management fee by the agreement's method. Percent in basis points (500 = 5%), rounded to the baisa. */
export function managementFee(
  method: 'PERCENT_OF_COLLECTED' | 'PERCENT_OF_DUE' | 'FIXED',
  rateBp: number | null,
  fixed: number | null,
  collected: number,
  due: number,
): { base: number; amount: number } {
  if (method === 'FIXED') return { base: 0, amount: fixed ?? 0 };
  const base = method === 'PERCENT_OF_DUE' ? due : collected;
  return { base, amount: Math.round((Math.max(0, base) * (rateBp ?? 0)) / 10000) };
}

/**
 * Split an amount between partners by their shares (basis points, total 10000) to the exact baisa:
 * each gets the floor of their share, and the leftover baisa go to the largest shares first.
 */
export function splitByShares<T extends { shareBp: number }>(amount: number, partners: T[]): (T & { amount: number })[] {
  if (!partners.length) return [];
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const total = partners.reduce((s, p) => s + p.shareBp, 0) || 1;
  const rows = partners.map((p, i) => ({ p, i, raw: Math.floor((abs * p.shareBp) / total) }));
  let left = abs - rows.reduce((s, r) => s + r.raw, 0);
  const order = [...rows].sort((a, b) => b.p.shareBp - a.p.shareBp || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left -= 1) order[k].raw += 1;
  return rows.map((r) => ({ ...r.p, amount: sign * r.raw }));
}

/**
 * Lines posted when a statement is issued:
 *   Dr owner share (net + fee)  /  Cr management fee income (fee)  /  Cr owed to each owner (their part of net)
 * Zero lines are dropped; a negative net (owner owes) flips naturally.
 */
export function statementLines(
  net: number,
  fee: number,
  splits: { ownerId: string; amount: number }[],
  propertyId: string,
): Line[] {
  const lines: Line[] = [
    { account: 'OWNER_SHARE', amount: net + fee, propertyId },
    { account: 'MGMT_FEE_INCOME', amount: -fee, propertyId },
    ...splits.map((s) => ({ account: 'OWNER_PAYABLE' as const, amount: -s.amount, propertyId, ownerId: s.ownerId })),
  ];
  return lines.filter((l) => l.amount !== 0);
}
