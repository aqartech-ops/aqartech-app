import {
  agingBucket,
  assertBalanced,
  chargeLines,
  naturalBalance,
  openItems,
  paymentLines,
  collectionRate,
  chequeClearedLines,
  nthChequeNumber,
  expenseLines,
  defaultBearer,
  netOperatingIncome,
  postingDate,
  pair,
  reverseLines,
  sumByAccount,
  UnbalancedEntryError,
  withRunningBalance,
} from './journal.js';
import { chargesFromLease, cutAt } from './charges-plan.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

describe('journal rules', () => {
  it('accepts a balanced entry and rejects an unbalanced one', () => {
    expect(() => assertBalanced(pair('TENANT_RECEIVABLE', 'RENT_INCOME', 300000))).not.toThrow();
    expect(() =>
      assertBalanced([
        { account: 'CASH', amount: 100 },
        { account: 'RENT_INCOME', amount: -99 },
      ]),
    ).toThrow(UnbalancedEntryError);
  });

  it('rejects single lines, zero and fractional amounts', () => {
    expect(() => assertBalanced([{ account: 'CASH', amount: 0 }])).toThrow();
    expect(() =>
      assertBalanced([
        { account: 'CASH', amount: 0.5 },
        { account: 'RENT_INCOME', amount: -0.5 },
      ]),
    ).toThrow();
    expect(() => pair('CASH', 'RENT_INCOME', 0)).toThrow();
  });

  it('a reversal cancels the original exactly', () => {
    const original = chargeLines('RENT', 280000, { tenantId: 't1', leaseId: 'l1' });
    const totals = sumByAccount([...original, ...reverseLines(original)]);
    expect(Object.values(totals).every((v) => v === 0)).toBe(true);
    expect(reverseLines(original)[0].tenantId).toBe('t1');
  });

  it('a deposit is a liability, never income', () => {
    const totals = sumByAccount(chargeLines('DEPOSIT', 300000, {}));
    expect(totals.RENT_INCOME).toBe(0);
    expect(naturalBalance('SECURITY_DEPOSITS', totals.SECURITY_DEPOSITS)).toBe(300000);
    expect(naturalBalance('TENANT_RECEIVABLE', totals.TENANT_RECEIVABLE)).toBe(300000);
  });

  it('a year of rent: receivable equals income, trial balance is zero', () => {
    const lines = Array.from({ length: 12 }, () => chargeLines('RENT', 250000, {})).flat();
    const totals = sumByAccount(lines);
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(0);
    expect(naturalBalance('RENT_INCOME', totals.RENT_INCOME)).toBe(3000000);
  });

  it('aging buckets', () => {
    expect(agingBucket(0)).toBeNull();
    expect(agingBucket(1)).toBe('0_30');
    expect(agingBucket(30)).toBe('0_30');
    expect(agingBucket(31)).toBe('31_60');
    expect(agingBucket(90)).toBe('61_90');
    expect(agingBucket(91)).toBe('90_plus');
  });

  it('open items: payments settle the oldest charges first', () => {
    const charges = [
      { id: 'a', amount: 300000, dueDate: d('2026-01-01') },
      { id: 'b', amount: 300000, dueDate: d('2026-02-01') },
      { id: 'c', amount: 300000, dueDate: d('2026-03-01') },
    ];
    // owes 450: March fully, February half, January paid
    expect(openItems(charges, 450000).map((c) => c.outstanding)).toEqual([0, 150000, 300000]);
    expect(openItems(charges, 0).every((c) => c.outstanding === 0)).toBe(true);
    expect(openItems(charges, -50000).every((c) => c.outstanding === 0)).toBe(true); // credit balance
    expect(openItems(charges, 2000000).map((c) => c.outstanding)).toEqual([300000, 300000, 300000]);
  });

  it('a payment settles the receivable into cash, bank or cheques', () => {
    const charge = chargeLines('RENT', 300000, { tenantId: 't', leaseId: 'l' });
    const cash = paymentLines('CASH', 300000, { tenantId: 't', leaseId: 'l' });
    const totals = sumByAccount([...charge, ...cash]);
    expect(totals.TENANT_RECEIVABLE).toBe(0);
    expect(totals.CASH).toBe(300000);
    expect(naturalBalance('RENT_INCOME', totals.RENT_INCOME)).toBe(300000);
    expect(sumByAccount(paymentLines('CHEQUE', 1000, {})).CHEQUES_ON_HAND).toBe(1000);
    expect(sumByAccount(paymentLines('CARD', 1000, {})).BANK).toBe(1000);
  });

  it('partial payment leaves the newest part open', () => {
    const charges = [
      { id: 'a', amount: 300000, dueDate: d('2026-01-01') },
      { id: 'b', amount: 300000, dueDate: d('2026-02-01') },
    ];
    // billed 600, paid 350 → January settled, February 250 open
    expect(openItems(charges, 600000 - 350000).map((c) => c.outstanding)).toEqual([0, 250000]);
  });

  it('cheque life: credited when under collection, cleared to the bank, fee is other income', () => {
    const dims = { tenantId: 't', leaseId: 'l' };
    const lines = [
      ...chargeLines('RENT', 300000, dims),
      ...paymentLines('CHEQUE', 300000, dims), // accepted → under collection
      ...chequeClearedLines(300000, dims), // cleared
    ];
    const totals = sumByAccount(lines);
    expect(totals.CHEQUES_ON_HAND).toBe(0);
    expect(totals.BANK).toBe(300000);
    expect(totals.TENANT_RECEIVABLE).toBe(0);
    const fee = sumByAccount(chargeLines('FEE', 10000, dims));
    expect(naturalBalance('OTHER_INCOME', fee.OTHER_INCOME)).toBe(10000);
    expect(fee.RENT_INCOME).toBe(0);
  });

  it('a bounced cheque restores what the tenant owes', () => {
    const dims = { tenantId: 't', leaseId: 'l' };
    const payment = paymentLines('CHEQUE', 300000, dims);
    const totals = sumByAccount([...chargeLines('RENT', 300000, dims), ...payment, ...reverseLines(payment)]);
    expect(totals.TENANT_RECEIVABLE).toBe(300000);
    expect(totals.CHEQUES_ON_HAND).toBe(0);
  });

  it('sequential cheque numbers keep leading zeros', () => {
    expect(nthChequeNumber('000123', 0)).toBe('000123');
    expect(nthChequeNumber('000123', 2)).toBe('000125');
    expect(nthChequeNumber('CHQ-0099', 1)).toBe('CHQ-0100');
    expect(nthChequeNumber('ABC', 1)).toBe('ABC-2');
  });

  it('an expense leaves cash or bank; NOI = income − expenses', () => {
    const lines = [...chargeLines('RENT', 300000, {}), ...paymentLines('CASH', 300000, {}), ...expenseLines('CASH', 45000, { propertyId: 'p' })];
    const totals = sumByAccount(lines);
    expect(totals.CASH).toBe(255000);
    expect(naturalBalance('EXPENSES', totals.EXPENSES)).toBe(45000);
    expect(netOperatingIncome(naturalBalance('RENT_INCOME', totals.RENT_INCOME), naturalBalance('EXPENSES', totals.EXPENSES))).toBe(255000);
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('a cost charged to the tenant comes back as receivable', () => {
    const totals = sumByAccount([...expenseLines('BANK', 20000, {}), ...chargeLines('FEE', 20000, { tenantId: 't' })]);
    expect(totals.TENANT_RECEIVABLE).toBe(20000);
    expect(totals.BANK).toBe(-20000);
  });

  it('default cost bearer follows the property', () => {
    expect(defaultBearer('MANAGED')).toBe('OWNER');
    expect(defaultBearer('OWNED')).toBe('COMPANY');
  });

  it('month close: closed dates are refused, corrections roll into the open period', () => {
    const locked = d('2026-09-30');
    expect(postingDate(d('2026-10-01'), locked, false)?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(postingDate(d('2026-09-15'), locked, false)).toBeNull();
    expect(postingDate(d('2026-09-15'), locked, true)?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(postingDate(d('2026-01-01'), null, false)?.toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('collection rate', () => {
    expect(collectionRate(0, 0)).toBeNull();
    expect(collectionRate(250000, 300000)).toBe(83.3);
    expect(collectionRate(600000, 300000)).toBe(200);
  });

  it('running balance', () => {
    expect(withRunningBalance([{ amount: 100 }, { amount: -40 }, { amount: 10 }]).map((r) => r.balance)).toEqual([100, 60, 70]);
  });
});

describe('charges from a lease', () => {
  const lease = {
    startDate: d('2026-01-01'),
    endDate: d('2026-12-31'),
    monthlyRent: 300000,
    discount: 0,
    deposit: 300000,
    paymentFrequency: 'MONTHLY' as const,
    dueDay: 1,
  };

  it('deposit first (index 0), then 12 rent installments', () => {
    const list = chargesFromLease(lease);
    expect(list).toHaveLength(13);
    expect(list[0]).toMatchObject({ kind: 'DEPOSIT', index: 0, amount: 300000 });
    expect(list.filter((c) => c.kind === 'RENT').reduce((s, c) => s + c.amount, 0)).toBe(3600000);
  });

  it('no deposit charge when the deposit is zero', () => {
    expect(chargesFromLease({ ...lease, deposit: 0 }).some((c) => c.kind === 'DEPOSIT')).toBe(false);
  });

  it('early termination cancels later periods and prorates the current one', () => {
    const charges = chargesFromLease(lease).map((c, i) => ({ ...c, id: `c${i}` }));
    // leaves on 16 March: Jan + Feb kept, March = 15 of 31 days, April onwards cancelled
    const cuts = cutAt(charges, d('2026-03-16'), 300000);
    const march = cuts.find((c) => c.action === 'shorten');
    expect(march).toMatchObject({ action: 'shorten', amount: 145161 }); // 300 × 15/31 = 145.161
    expect(march && 'periodEnd' in march ? iso(march.periodEnd) : null).toBe('2026-03-15');
    expect(cuts.filter((c) => c.action === 'cancel')).toHaveLength(9);
    expect(cuts.some((c) => c.id === 'c0')).toBe(false); // deposit untouched
  });

  it('termination on a period start cancels that period entirely', () => {
    const charges = chargesFromLease(lease).map((c, i) => ({ ...c, id: `c${i}` }));
    const cuts = cutAt(charges, d('2026-04-01'), 300000);
    expect(cuts.every((c) => c.action === 'cancel')).toBe(true);
    expect(cuts).toHaveLength(9);
  });
});
