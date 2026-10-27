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
 *  - fee:     Dr tenant receivable / Cr other income (e.g. bounced-cheque fee)
 */
export function chargeLines(kind: 'RENT' | 'DEPOSIT' | 'FEE', amount: number, dims: Dimensions): Line[] {
  const credit: Account = kind === 'RENT' ? 'RENT_INCOME' : kind === 'DEPOSIT' ? 'SECURITY_DEPOSITS' : 'OTHER_INCOME';
  return pair('TENANT_RECEIVABLE', credit, amount, dims);
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

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Where collected money lands: cash box, bank, or cheques waiting to be deposited. */
export const PAYMENT_ACCOUNT: Record<PaymentMethod, Account> = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK',
  CARD: 'BANK',
  ONLINE: 'BANK',
  CHEQUE: 'CHEQUES_ON_HAND',
};

/** A collection: Dr cash/bank/cheques / Cr tenant receivable. */
export function paymentLines(method: PaymentMethod, amount: number, dims: Dimensions): Line[] {
  return pair(PAYMENT_ACCOUNT[method], 'TENANT_RECEIVABLE', amount, dims);
}

/** Collection rate as a percentage with one decimal (null when nothing was billed). */
export function collectionRate(collected: number, billed: number): number | null {
  if (billed <= 0) return null;
  return Math.round((collected * 1000) / billed) / 10;
}

/** A cheque under collection clears at the bank: Dr bank / Cr cheques under collection. */
export function chequeClearedLines(amount: number, dims: Dimensions): Line[] {
  return pair('BANK', 'CHEQUES_ON_HAND', amount, dims);
}

/** "000123" + 2 → "000125" (keeps leading zeros); non-numeric numbers get a suffix: "A12" + 2 → "A12-3". */
export function nthChequeNumber(first: string, offset: number): string {
  const m = /^(.*?)(\d+)$/.exec(first.trim());
  if (!m) return offset === 0 ? first.trim() : `${first.trim()}-${offset + 1}`;
  const next = String(Number(m[2]) + offset).padStart(m[2].length, '0');
  return `${m[1]}${next}`;
}
