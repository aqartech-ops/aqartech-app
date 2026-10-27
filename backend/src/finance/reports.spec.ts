import { daysIn, effectiveEnd, monthsBetween, occupancy, pct, renewalRate } from './reports.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('reports', () => {
  it('days and effective end', () => {
    expect(daysIn(d('2026-01-01'), d('2026-01-31'))).toBe(31);
    expect(daysIn(d('2026-02-01'), d('2026-01-31'))).toBe(0);
    expect(effectiveEnd({ endDate: d('2026-12-31'), terminatedAt: d('2026-06-16') }).toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(effectiveEnd({ endDate: d('2026-12-31'), terminatedAt: null }).toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('occupancy counts overlapping leases once and respects the window', () => {
    const units = [
      { id: 'a', availableFrom: d('2025-01-01') },
      { id: 'b', availableFrom: d('2026-07-01') }, // added mid-year
    ];
    const leases = [
      { unitId: 'a', startDate: d('2025-06-01'), endDate: d('2026-05-31'), terminatedAt: null },
      { unitId: 'a', startDate: d('2026-05-01'), endDate: d('2027-04-30'), terminatedAt: null }, // overlaps the first
      { unitId: 'b', startDate: d('2026-10-01'), endDate: d('2027-09-30'), terminatedAt: null },
    ];
    const r = occupancy(units, leases, d('2026-01-01'), d('2026-12-31'));
    expect(r.availableDays).toBe(365 + 184); // a: whole year, b: from 1 July
    expect(r.occupiedDays).toBe(365 + 92); // a: all year, b: Oct–Dec
    expect(r.vacantDays).toBe(92);
    expect(r.rate).toBe(83.2);
  });

  it('early termination ends occupancy the day before', () => {
    const r = occupancy(
      [{ id: 'a', availableFrom: d('2020-01-01') }],
      [{ unitId: 'a', startDate: d('2026-01-01'), endDate: d('2026-12-31'), terminatedAt: d('2026-02-01') }],
      d('2026-01-01'),
      d('2026-01-31'),
    );
    expect(r.rate).toBe(100);
    const feb = occupancy([{ id: 'a', availableFrom: d('2020-01-01') }], [{ unitId: 'a', startDate: d('2026-01-01'), endDate: d('2026-12-31'), terminatedAt: d('2026-02-01') }], d('2026-02-01'), d('2026-02-28'));
    expect(feb.rate).toBe(0);
  });

  it('percentages and renewal rate', () => {
    expect(pct(52000, 600000)).toBe(8.7);
    expect(pct(1, 0)).toBeNull();
    expect(renewalRate([{ renewed: true }, { renewed: false }, { renewed: true }])).toBe(66.7);
    expect(renewalRate([])).toBeNull();
  });

  it('months between', () => {
    expect(monthsBetween(d('2025-11-15'), d('2026-02-01'))).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
