import { addMonths, daysLeft, effective, eventType, omanDay, renewedEnd } from './subscription-rules.js';

describe('subscriber management', () => {
  it('adds months keeping the end of short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-12-01', 12)).toBe('2027-12-01');
  });

  it('renews from the current end when still running, else from today', () => {
    // running until 31 Mar → +1 month = until 30 Apr
    expect(renewedEnd('2026-03-31', '2026-03-10', 'MONTHLY', 1)).toBe('2026-04-30');
    // ended long ago → from today
    expect(renewedEnd('2026-01-31', '2026-03-10', 'MONTHLY', 1)).toBe('2026-04-09');
    // no end yet → from today, one year
    expect(renewedEnd(null, '2026-11-09', 'YEARLY', 1)).toBe('2027-11-08');
    // ends today → continues from tomorrow
    expect(renewedEnd('2026-11-09', '2026-11-09', 'MONTHLY', 3)).toBe('2027-02-09');
  });

  it('counts days left and uses Oman days', () => {
    expect(daysLeft('2026-11-23', '2026-11-09')).toBe(14);
    expect(daysLeft('2026-11-09', '2026-11-09')).toBe(0);
    expect(daysLeft('2026-11-01', '2026-11-09')).toBe(-8);
    expect(omanDay(new Date('2026-11-08T21:30:00Z'))).toBe('2026-11-09');
  });

  it('treats a past end day as expired after the grace days', () => {
    expect(effective('ACTIVE', '2026-11-30', '2026-11-09', 3)).toEqual({ status: 'ACTIVE', inGrace: false });
    expect(effective('ACTIVE', '2026-11-07', '2026-11-09', 3)).toEqual({ status: 'ACTIVE', inGrace: true });
    expect(effective('ACTIVE', '2026-11-05', '2026-11-09', 3)).toEqual({ status: 'EXPIRED', inGrace: false });
    expect(effective('ACTIVE', null, '2026-11-09', 3)).toEqual({ status: 'ACTIVE', inGrace: false });
    expect(effective('SUSPENDED', '2030-01-01', '2026-11-09', 3)).toEqual({ status: 'SUSPENDED', inGrace: false });
  });

  it('names the change for the history', () => {
    expect(eventType({ status: 'PENDING', planId: 'a' }, { status: 'ACTIVE' })).toBe('ACTIVATED');
    expect(eventType({ status: 'SUSPENDED', planId: 'a' }, { status: 'ACTIVE' })).toBe('RESUMED');
    expect(eventType({ status: 'ACTIVE', planId: 'a' }, { status: 'SUSPENDED' })).toBe('SUSPENDED');
    expect(eventType({ status: 'ACTIVE', planId: 'a' }, { planId: 'b' })).toBe('PLAN_CHANGED');
    expect(eventType({ status: 'ACTIVE', planId: 'a' }, { planId: 'a' })).toBe('UPDATED');
  });
});
