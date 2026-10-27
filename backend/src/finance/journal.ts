// Double-entry rules (القيد المزدوج) as pure functions — the heart of the financial engine.
// Amounts are integer baisa. Convention: + = debit (مدين), − = credit (دائن). Every entry sums to zero.

export const ACCOUNTS = [
  'CASH',
  'BANK',
  'CHEQUES_ON_HAND',
  'TENANT_RECEIVABLE',
  'SECURITY_DEPOSITS',
  'RENT_INCOME',
  'OTHER_INCOME',
  'MGMT_FEE_INCOME',
  'OWNER_PAYABLE',
  'EXPENSES',
] as const;
export type Account = (typeof ACCOUNTS)[number];

/** Natural side of each account: assets/expenses grow with debits, the others with credits. */
export const DEBIT_NATURE: Record<Account, boolean> = {
  CASH: true,
  BANK: true,
  CHEQUES_ON_HAND: true,
  TENANT_RECEIVABLE: true,
  EXPENSES: true,
  SECURITY_DEPOSITS: false,
  RENT_INCOME: false,
  OTHER_INCOME: false,
  MGMT_FEE_INCOME: false,
  OWNER_PAYABLE: false,
};

export type Dimensions = {
  propertyId?: string | null;
  unitId?: string | null;
  leaseId?: string | null;
  tenantId?: string | null;
  ownerId?: string | null;
};

export type Line = Dimensions & { account: Account; amount: number };

export class UnbalancedEntryError extends Error {
  constructor(readonly total: number) {
    super(`Journal entry does not balance (sum = ${total} baisa)`);
  }
}

/** Throws unless the lines form a valid entry: ≥ 2 lines, integer non-zero amounts, total = 0. */
export function assertBalanced(lines: Line[]): void {
  if (lines.length < 2) throw new UnbalancedEntryError(lines[0]?.amount ?? 0);
  let total = 0;
  for (const l of lines) {
    if (!Number.isSafeInteger(l.amount) || l.amount === 0) throw new Error(`Invalid line amount: ${l.amount}`);
    if (!(ACCOUNTS as readonly string[]).includes(l.account)) throw new Error(`Unknown account: ${l.account}`);
    total += l.amount;
  }
  if (total !== 0) throw new UnbalancedEntryError(total);
}

/** The lines of a reversing entry: same accounts and dimensions, opposite signs. */
export function reverseLines(lines: Line[]): Line[] {
  return lines.map((l) => ({ ...l, amount: -l.amount }));
}

/** Debit `account` and credit `against` with the same positive amount and dimensions. */
export function pair(debit: Account, credit: Account, amount: number, dims: Dimensions = {}): Line[] {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`Invalid amount: ${amount}`);
  return [
    { account: debit, amount, ...dims },
    { account: credit, amount: -amount, ...dims },
  ];
}

/**
 * A charge becoming due:
 *  - rent:    Dr tenant receivable / Cr rent income
 *  - deposit: Dr tenant receivable / Cr security deposits (a liability — the deposit is NOT income)
 */
export function chargeLines(kind: 'RENT' | 'DEPOSIT', amount: number, dims: Dimensions): Line[] {
  return pair('TENANT_RECEIVABLE', kind === 'RENT' ? 'RENT_INCOME' : 'SECURITY_DEPOSITS', amount, dims);
}

/** Balance of an account in its natural direction (e.g. income shown positive). */
export function naturalBalance(account: Account, signedSum: number): number {
  return DEBIT_NATURE[account] ? signedSum : -signedSum;
}

/** Sum signed amounts per account. */
export function sumByAccount(lines: Pick<Line, 'account' | 'amount'>[]): Record<Account, number> {
  const out = Object.fromEntries(ACCOUNTS.map((a) => [a, 0])) as Record<Account, number>;
  for (const l of lines) out[l.account] += l.amount;
  return out;
}

/** Days overdue → aging bucket (أعمار الديون). Not overdue → null. */
export function agingBucket(daysOverdue: number): '0_30' | '31_60' | '61_90' | '90_plus' | null {
  if (daysOverdue <= 0) return null;
  if (daysOverdue <= 30) return '0_30';
  if (daysOverdue <= 60) return '31_60';
  if (daysOverdue <= 90) return '61_90';
  return '90_plus';
}

/** Running balance for a statement, oldest first. */
export function withRunningBalance<T extends { amount: number }>(rows: T[]): (T & { balance: number })[] {
  let balance = 0;
  return rows.map((r) => {
    balance += r.amount;
    return { ...r, balance };
  });
}

/**
 * Which charges are still unpaid, given what the tenant owes in total (their receivable balance).
 * Payments settle the OLDEST charges first, so the unpaid part is always the most recent charges:
 * walk from newest to oldest until the balance is used up. Works whether or not a payment was
 * matched to a specific charge, and stays consistent with the ledger by construction.
 */
export function openItems<T extends { id: string; amount: number; dueDate: Date }>(charges: T[], balance: number): (T & { outstanding: number })[] {
  const newestFirst = [...charges].sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime() || (a.id < b.id ? 1 : -1));
  let remaining = Math.max(0, balance);
  const out = newestFirst.map((c) => {
    const outstanding = Math.min(c.amount, remaining);
    remaining -= outstanding;
    return { ...c, outstanding };
  });
  return out.reverse(); // oldest first
}
