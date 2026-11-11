// Monthly property report (التقرير الشهري للعقار) — pure functions, unit-tested.
// Dates are UTC midnights; money is integer baisa. Everything is computed from the books, nothing typed in.

import { agingBucket, openItems } from '../finance/journal.js';

const DAY = 86_400_000;

export type MonthRange = { key: string; from: Date; to: Date; monthEnd: Date; current: boolean };

/** "2026-06" (or nothing = this month) → the month's window; the current month runs up to today. Null = invalid / future. */
export function monthRange(key: string | undefined | null, today: Date): MonthRange | null {
  const thisKey = today.toISOString().slice(0, 7);
  const k = key || thisKey;
  const m = /^(\d{4})-(\d{2})$/.exec(k);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 2000 || k > thisKey) return null;
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const monthEnd = new Date(Date.UTC(y, mo, 0));
  const current = k === thisKey;
  return { key: k, from, monthEnd, to: current ? today : monthEnd, current };
}

/** The month before "2026-01" is "2025-12". */
export function previousMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- expense groups (rows of the financial summary)

export const EXPENSE_GROUPS = ['MAINTENANCE', 'UTILITIES', 'STAFF', 'ADMIN'] as const;
export type ExpenseGroup = (typeof EXPENSE_GROUPS)[number];

/**
 * Report group of an expense item: the one chosen in "Expense items", else guessed from the item
 * (the maintenance item, utilities, salaries/cleaning/security …); anything else is administration.
 */
export function expenseGroup(cat: { reportGroup?: string | null; isMaintenance?: boolean; nameEn?: string; nameAr?: string }): ExpenseGroup {
  if (cat.reportGroup && (EXPENSE_GROUPS as readonly string[]).includes(cat.reportGroup)) return cat.reportGroup as ExpenseGroup;
  if (cat.isMaintenance) return 'MAINTENANCE';
  const name = `${cat.nameEn ?? ''} ${cat.nameAr ?? ''}`.toLowerCase();
  if (/electric|water|utilit|power|gas|internet|كهرباء|مياه|ماء|مرافق|غاز|إنترنت|انترنت/.test(name)) return 'UTILITIES';
  if (/maint|repair|plumb|paint|ac\b|صيانة|إصلاح|اصلاح|سباكة|تكييف|دهان/.test(name)) return 'MAINTENANCE';
  if (/salar|wage|staff|cleaning|security|guard|watchman|رواتب|راتب|أجور|اجور|موظف|نظافة|حراسة|أمن|امن|حارس/.test(name)) return 'STAFF';
  return 'ADMIN';
}

// ---------------------------------------------------------------- cash flow (الصندوق والبنك of the property)

export type CashLine = { amount: number; date: Date; type: string; reversesType?: string | null };

export type CashFlow = {
  opening: number;
  cashRent: number; // collections received in cash / transfer / card
  chequesDeposited: number; // cheques that cleared at the bank
  otherIn: number;
  paymentsMade: number; // expenses, deposit refunds and other money out (positive number)
  remitted: number; // transfers to the owner (positive number)
  closing: number;
  totalRentCollected: number;
};

/** Cash + bank movements of the property → the month's cash flow. A reversal counts with the document it reverses. */
export function cashFlow(lines: CashLine[], from: Date, to: Date): CashFlow {
  const out: CashFlow = { opening: 0, cashRent: 0, chequesDeposited: 0, otherIn: 0, paymentsMade: 0, remitted: 0, closing: 0, totalRentCollected: 0 };
  for (const l of lines) {
    if (l.date < from) {
      out.opening += l.amount;
      continue;
    }
    if (l.date > to) continue;
    const type = l.type === 'REVERSAL' ? (l.reversesType ?? 'MANUAL') : l.type;
    if (type === 'PAYMENT') out.cashRent += l.amount;
    else if (type === 'CHEQUE_CLEARED') out.chequesDeposited += l.amount;
    else if (type === 'OWNER_PAYOUT') out.remitted -= l.amount;
    else if (type === 'EXPENSE' || type === 'DEPOSIT_REFUND') out.paymentsMade -= l.amount;
    else if (l.amount > 0) out.otherIn += l.amount;
    else out.paymentsMade -= l.amount;
  }
  out.closing = out.opening + out.cashRent + out.chequesDeposited + out.otherIn - out.paymentsMade - out.remitted;
  out.totalRentCollected = out.cashRent + out.chequesDeposited;
  return out;
}

// ---------------------------------------------------------------- arrears and aging as of a date

export type AgingCharge = { id: string; leaseId: string; tenantId: string; tenantName: string; unit: string; amount: number; dueDate: Date };
export const AGING_BUCKETS = ['0_30', '31_60', '61_90', '90_plus'] as const;
export type Bucket = (typeof AGING_BUCKETS)[number];

/**
 * What each tenant still owed on `asOf`: per lease, the receivable balance at that date is spread over its
 * newest charges (oldest are paid first — same rule as the receivables page), then aged by due date.
 */
export function agingAsOf(charges: AgingCharge[], balanceByLease: Map<string, number>, asOf: Date) {
  const byLease = new Map<string, AgingCharge[]>();
  for (const c of charges) if (c.dueDate <= asOf) byLease.set(c.leaseId, [...(byLease.get(c.leaseId) ?? []), c]);
  const items: (AgingCharge & { outstanding: number; daysOverdue: number; bucket: Bucket })[] = [];
  for (const [leaseId, list] of byLease) {
    for (const c of openItems(list, balanceByLease.get(leaseId) ?? 0)) {
      const daysOverdue = Math.round((asOf.getTime() - c.dueDate.getTime()) / DAY);
      const bucket = agingBucket(daysOverdue);
      if (c.outstanding > 0 && bucket) items.push({ ...c, daysOverdue, bucket });
    }
  }
  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  for (const i of items) buckets[i.bucket] += i.outstanding;
  const total = items.reduce((s, i) => s + i.outstanding, 0);
  // tenants with something more than 90 days late — with everything they owe
  const tenants = new Map<string, { tenantId: string; name: string; units: Set<string>; amount: number; over90: boolean; oldestDays: number }>();
  for (const i of items) {
    const t = tenants.get(i.tenantId) ?? { tenantId: i.tenantId, name: i.tenantName, units: new Set<string>(), amount: 0, over90: false, oldestDays: 0 };
    t.amount += i.outstanding;
    t.units.add(i.unit);
    t.over90 ||= i.bucket === '90_plus';
    t.oldestDays = Math.max(t.oldestDays, i.daysOverdue);
    tenants.set(i.tenantId, t);
  }
  const over90 = [...tenants.values()]
    .filter((t) => t.over90)
    .sort((a, b) => b.amount - a.amount)
    .map((t) => ({ tenantId: t.tenantId, name: t.name, units: [...t.units], amount: t.amount, oldestDays: t.oldestDays }));
  return { total, buckets, over90 };
}

// ---------------------------------------------------------------- comparison and narrative inputs

/** Change from last month (null when there is nothing to compare). */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}

/** Residential vs commercial units. */
export const COMMERCIAL_TYPES = ['SHOP', 'OFFICE', 'WAREHOUSE'];
export function unitMix(types: string[]) {
  const commercial = types.filter((t) => COMMERCIAL_TYPES.includes(t)).length;
  return { total: types.length, residential: types.length - commercial, commercial };
}
