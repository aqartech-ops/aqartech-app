import { agingAsOf, cashFlow, change, expenseGroup, monthRange, previousMonth, unitMix } from './monthly-report.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('monthRange', () => {
  const today = d('2026-11-12');
  it('defaults to the current month, running up to today', () => {
    const r = monthRange(undefined, today)!;
    expect(r.key).toBe('2026-11');
    expect(r.from).toEqual(d('2026-11-01'));
    expect(r.to).toEqual(today);
    expect(r.monthEnd).toEqual(d('2026-11-30'));
    expect(r.current).toBe(true);
  });
  it('a past month runs to its last day', () => {
    const r = monthRange('2026-02', today)!;
    expect(r.to).toEqual(d('2026-02-28'));
    expect(r.current).toBe(false);
  });
  it('refuses future and malformed months', () => {
    expect(monthRange('2026-12', today)).toBeNull();
    expect(monthRange('2026-13', today)).toBeNull();
    expect(monthRange('june', today)).toBeNull();
  });
  it('knows the previous month across a year', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-11')).toBe('2026-10');
  });
});

describe('expenseGroup', () => {
  it('uses the chosen group first', () => {
    expect(expenseGroup({ reportGroup: 'STAFF', isMaintenance: true })).toBe('STAFF');
  });
  it('guesses from the item when no group was chosen', () => {
    expect(expenseGroup({ isMaintenance: true, nameEn: 'Anything' })).toBe('MAINTENANCE');
    expect(expenseGroup({ nameEn: 'Electricity & water', nameAr: 'كهرباء ومياه' })).toBe('UTILITIES');
    expect(expenseGroup({ nameEn: 'Salaries' })).toBe('STAFF');
    expect(expenseGroup({ nameAr: 'حراسة وأمن', nameEn: '' })).toBe('STAFF');
    expect(expenseGroup({ nameEn: 'Insurance' })).toBe('ADMIN');
  });
});

describe('cashFlow', () => {
  const from = d('2026-06-01');
  const to = d('2026-06-30');
  it('splits the month into opening, collections, cheques, payments, owner transfer and closing', () => {
    const f = cashFlow(
      [
        { amount: 1_000_000, date: new Date(0), type: 'OPENING' },
        { amount: 2_500_000, date: d('2026-06-03'), type: 'PAYMENT' },
        { amount: 400_000, date: d('2026-06-05'), type: 'CHEQUE_CLEARED' },
        { amount: -100_000, date: d('2026-06-06'), type: 'REVERSAL', reversesType: 'PAYMENT' }, // voided receipt
        { amount: -300_000, date: d('2026-06-10'), type: 'EXPENSE' },
        { amount: -50_000, date: d('2026-06-11'), type: 'DEPOSIT_REFUND' },
        { amount: -1_200_000, date: d('2026-06-20'), type: 'OWNER_PAYOUT' },
        { amount: 35_000, date: d('2026-06-21'), type: 'MANUAL' },
        { amount: 999, date: d('2026-07-01'), type: 'PAYMENT' }, // next month: ignored
      ],
      from,
      to,
    );
    expect(f).toEqual({
      opening: 1_000_000,
      cashRent: 2_400_000,
      chequesDeposited: 400_000,
      otherIn: 35_000,
      paymentsMade: 350_000,
      remitted: 1_200_000,
      closing: 1_000_000 + 2_400_000 + 400_000 + 35_000 - 350_000 - 1_200_000,
      totalRentCollected: 2_800_000,
    });
  });
});

describe('agingAsOf', () => {
  const charge = (id: string, leaseId: string, tenantId: string, due: string, amount = 100_000) => ({ id, leaseId, tenantId, tenantName: tenantId.toUpperCase(), unit: `U-${leaseId}`, amount, dueDate: d(due) });
  it('ages what is still owed at the date, oldest paid first', () => {
    const asOf = d('2026-06-30');
    const charges = [
      charge('a1', 'L1', 't1', '2026-01-01'), // 180 days
      charge('a2', 'L1', 't1', '2026-05-15'), // 46 days
      charge('a3', 'L1', 't1', '2026-06-20'), // 10 days
      charge('b1', 'L2', 't2', '2026-06-01'), // paid
      charge('b2', 'L2', 't2', '2026-07-01'), // not due yet at asOf
    ];
    const r = agingAsOf(charges, new Map([['L1', 300_000], ['L2', 0]]), asOf);
    expect(r.buckets).toEqual({ '0_30': 100_000, '31_60': 100_000, '61_90': 0, '90_plus': 100_000 });
    expect(r.total).toBe(300_000);
    expect(r.over90).toEqual([{ tenantId: 't1', name: 'T1', units: ['U-L1'], amount: 300_000, oldestDays: 180 }]);
  });
  it('a partial balance settles the oldest charges first', () => {
    const r = agingAsOf([charge('a1', 'L1', 't1', '2026-01-01'), charge('a2', 'L1', 't1', '2026-06-20')], new Map([['L1', 150_000]]), d('2026-06-30'));
    expect(r.buckets['90_plus']).toBe(50_000);
    expect(r.buckets['0_30']).toBe(100_000);
  });
});

describe('helpers', () => {
  it('change between months', () => {
    expect(change(77.8, 70)).toBe(7.8);
    expect(change(null, 70)).toBeNull();
  });
  it('residential vs commercial units', () => {
    expect(unitMix(['APARTMENT', 'SHOP', 'STUDIO', 'OFFICE'])).toEqual({ total: 4, residential: 2, commercial: 2 });
  });
});
