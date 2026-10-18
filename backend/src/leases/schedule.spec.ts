import { addMonths, buildSchedule, rentForSpan, scheduleTotal, utcDate } from './schedule.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('lease schedule', () => {
  it('clamps month ends', () => {
    expect(addMonths(d('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(d('2026-01-31'), 2).toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('one year monthly = 12 equal installments', () => {
    const s = buildSchedule({ startDate: d('2026-01-01'), endDate: d('2026-12-31'), monthlyRent: 300000, paymentFrequency: 'MONTHLY' });
    expect(s).toHaveLength(12);
    expect(s.every((x) => x.amount === 300000 && !x.partial)).toBe(true);
    expect(scheduleTotal(s)).toBe(3600000);
    expect(s[11].periodEnd.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('quarterly applies the discount per month', () => {
    const s = buildSchedule({
      startDate: d('2026-01-01'),
      endDate: d('2026-12-31'),
      monthlyRent: 300000,
      discount: 20000,
      paymentFrequency: 'QUARTERLY',
    });
    expect(s).toHaveLength(4);
    expect(s[0].amount).toBe(840000); // (300 - 20) × 3 OMR
  });

  it('prorates a short last period by days', () => {
    // 1 Jan → 15 Mar: Jan + Feb full, then 15 of 31 days of March
    const s = buildSchedule({ startDate: d('2026-01-01'), endDate: d('2026-03-15'), monthlyRent: 310000, paymentFrequency: 'MONTHLY' });
    expect(s).toHaveLength(3);
    expect(s[2].partial).toBe(true);
    expect(s[2].amount).toBe(150000); // 310 × 15/31
  });

  it('first installment is due on the start date, later ones on the due day', () => {
    const s = buildSchedule({ startDate: d('2026-01-15'), endDate: d('2027-01-14'), monthlyRent: 250000, paymentFrequency: 'MONTHLY', dueDay: 5 });
    expect(s[0].dueDate.toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(s[1].dueDate.toISOString().slice(0, 10)).toBe('2026-02-05');
    expect(s).toHaveLength(12);
  });

  it('rentForSpan counts whole months then days', () => {
    expect(rentForSpan(utcDate(2026, 0, 1), utcDate(2026, 1, 1), 280000)).toBe(280000);
  });
});
