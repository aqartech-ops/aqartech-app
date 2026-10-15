import { toBaisa, formatOMR, percentOf } from './money.js';

describe('money', () => {
  it('parses OMR strings into integer baisa', () => {
    expect(toBaisa('12')).toBe(12000);
    expect(toBaisa('12.5')).toBe(12500);
    expect(toBaisa('12.005')).toBe(12005);
    expect(toBaisa('1,250.750')).toBe(1250750);
    expect(toBaisa('-3.1')).toBe(-3100);
    expect(toBaisa(0.1)).toBe(100);
  });

  it('rejects more than 3 decimals and garbage', () => {
    expect(() => toBaisa('1.0001')).toThrow();
    expect(() => toBaisa('abc')).toThrow();
  });

  it('formats baisa as OMR with 3 decimals', () => {
    expect(formatOMR(12500)).toBe('12.500');
    expect(formatOMR(1250750)).toBe('1,250.750');
    expect(formatOMR(-5)).toBe('-0.005');
  });

  it('computes percentages without float drift', () => {
    // 0.1 + 0.2 style errors must never appear
    expect(percentOf(10750000, 500)).toBe(537500); // 5% of 10,750 OMR
    expect(percentOf(333, 3333)).toBe(111);
  });
});
