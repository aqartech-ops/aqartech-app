import { allocateByKind, managementFee, splitByShares, statementLines } from './owner-statement.js';
import { assertBalanced, naturalBalance, sumByAccount, chargeLines, paymentLines } from './journal.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('owner statement', () => {
  const charges = [
    { kind: 'RENT' as const, index: 1, amount: 300000, dueDate: d('2026-01-01') },
    { kind: 'DEPOSIT' as const, index: 0, amount: 300000, dueDate: d('2026-01-01') },
    { kind: 'RENT' as const, index: 2, amount: 300000, dueDate: d('2026-02-01') },
    { kind: 'FEE' as const, index: 1, amount: 10000, dueDate: d('2026-02-10') },
  ];

  it('payments settle the deposit first, then rent and fees by date', () => {
    expect(allocateByKind(charges, 450000)).toEqual({ DEPOSIT: 300000, RENT: 150000, FEE: 0 });
    expect(allocateByKind(charges, 910000)).toEqual({ DEPOSIT: 300000, RENT: 600000, FEE: 10000 });
    expect(allocateByKind(charges, 0)).toEqual({ DEPOSIT: 0, RENT: 0, FEE: 0 });
  });

  it('rent collected in a period = allocation at the end − allocation before the start', () => {
    const before = allocateByKind(charges, 300000).RENT; // only the deposit was paid before
    const after = allocateByKind(charges, 900000).RENT;
    expect(after - before).toBe(600000);
  });

  it('management fee', () => {
    expect(managementFee('PERCENT_OF_COLLECTED', 500, null, 600000, 900000)).toEqual({ base: 600000, amount: 30000 });
    expect(managementFee('PERCENT_OF_DUE', 500, null, 600000, 900000)).toEqual({ base: 900000, amount: 45000 });
    expect(managementFee('FIXED', null, 25000, 600000, 900000).amount).toBe(25000);
    expect(managementFee('PERCENT_OF_COLLECTED', 333, null, 100001, 0).amount).toBe(3330); // 3330.03 → 3330
  });

  it('partner split is exact to the baisa', () => {
    const parts = splitByShares(100001, [
      { ownerId: 'a', shareBp: 6000 },
      { ownerId: 'b', shareBp: 4000 },
    ]);
    expect(parts.map((p) => p.amount)).toEqual([60001, 40000]);
    const thirds = splitByShares(100, [
      { ownerId: 'a', shareBp: 3333 },
      { ownerId: 'b', shareBp: 3333 },
      { ownerId: 'c', shareBp: 3334 },
    ]);
    expect(thirds.reduce((s, p) => s + p.amount, 0)).toBe(100);
    expect(splitByShares(-101, [{ ownerId: 'a', shareBp: 5000 }, { ownerId: 'b', shareBp: 5000 }]).reduce((s, p) => s + p.amount, 0)).toBe(-101);
  });

  it('issuing a statement balances and leaves the company with its fee', () => {
    // rent 600 collected, owner expenses 50, fee 30 → net 520
    const net = 520000;
    const fee = 30000;
    const splits = splitByShares(net, [
      { ownerId: 'a', shareBp: 6000 },
      { ownerId: 'b', shareBp: 4000 },
    ]);
    const lines = statementLines(net, fee, splits, 'p');
    assertBalanced(lines);
    const all = [
      ...chargeLines('RENT', 600000, {}),
      ...paymentLines('BANK_TRANSFER', 600000, {}),
      { account: 'EXPENSES' as const, amount: 50000 },
      { account: 'BANK' as const, amount: -50000 },
      ...lines,
    ];
    const t = sumByAccount(all);
    const companyProfit =
      naturalBalance('RENT_INCOME', t.RENT_INCOME) + naturalBalance('MGMT_FEE_INCOME', t.MGMT_FEE_INCOME) - t.EXPENSES - t.OWNER_SHARE;
    expect(companyProfit).toBe(fee);
    expect(naturalBalance('OWNER_PAYABLE', t.OWNER_PAYABLE)).toBe(net);
  });

  it('a negative net (owner owes) still balances', () => {
    const lines = statementLines(-20000, 5000, [{ ownerId: 'a', amount: -20000 }], 'p');
    assertBalanced(lines);
  });
});
