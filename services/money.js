// Money on the app side. The API always sends integer baisa (1 OMR = 1000 baisa).
// Format only for display; never do math on formatted strings or floats.

export const BAISA_PER_OMR = 1000;

export function formatOMR(baisa, lang = 'en', { withCurrency = true } = {}) {
  if (baisa === null || baisa === undefined || Number.isNaN(baisa)) return '—';
  const negative = baisa < 0;
  const abs = Math.abs(Math.trunc(baisa));
  const whole = Math.floor(abs / BAISA_PER_OMR).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % BAISA_PER_OMR).toString().padStart(3, '0');
  const amount = `${negative ? '-' : ''}${whole}.${frac}`;
  if (!withCurrency) return amount;
  return lang === 'ar' ? `${amount} ر.ع` : `OMR ${amount}`;
}

/** "12.5" → 12500. Returns null when the text is not a valid amount (max 3 decimals). */
export function parseOMR(text) {
  const raw = String(text ?? '').replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d{1,3})?$/.test(raw)) return null;
  const negative = raw.startsWith('-');
  const [whole, frac = ''] = raw.replace('-', '').split('.');
  const baisa = Number(whole) * BAISA_PER_OMR + Number(frac.padEnd(3, '0'));
  return negative ? -baisa : baisa;
}
