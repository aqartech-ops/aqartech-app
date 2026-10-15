// Money helpers. All amounts are integers in baisa (1 OMR = 1000 baisa).
// Never do money math with floats: parse once at the edge, compute in integers.

export const BAISA_PER_OMR = 1000;

/** Parse "12.5", "12.500", 12.5 or "1,250.750" (OMR) into integer baisa. Throws on invalid input. */
export function toBaisa(input: string | number): number {
  const raw = typeof input === 'number' ? input.toString() : input.replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d{1,3})?$/.test(raw)) {
    throw new Error(`Invalid OMR amount: "${input}" (max 3 decimals)`);
  }
  const negative = raw.startsWith('-');
  const [whole, frac = ''] = raw.replace('-', '').split('.');
  const baisa = Number(whole) * BAISA_PER_OMR + Number(frac.padEnd(3, '0'));
  if (!Number.isSafeInteger(baisa)) throw new Error(`Amount too large: "${input}"`);
  return negative ? -baisa : baisa;
}

/** Validate a value that must already be integer baisa (API inputs). */
export function assertBaisa(value: unknown, field = 'amount'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${field} must be an integer number of baisa`);
  }
  return value;
}

/** 12500 -> "12.500" */
export function formatOMR(baisa: number): string {
  const negative = baisa < 0;
  const abs = Math.abs(baisa);
  const whole = Math.floor(abs / BAISA_PER_OMR).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % BAISA_PER_OMR).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** Percentage of an amount in basis points (1% = 100 bp), rounded half-up to the nearest baisa. */
export function percentOf(baisa: number, basisPoints: number): number {
  return Math.round((baisa * basisPoints) / 10000);
}
