import { daysBetween, today } from './dates.js';

describe('dates (Oman calendar)', () => {
  it('today follows Muscat time (UTC+4)', () => {
    expect(today(new Date('2026-03-01T19:59:00Z')).toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(today(new Date('2026-03-01T20:00:00Z')).toISOString().slice(0, 10)).toBe('2026-03-02');
  });

  it('days between calendar dates', () => {
    expect(daysBetween(new Date('2026-01-01T00:00:00Z'), new Date('2026-03-01T00:00:00Z'))).toBe(59);
  });
});
