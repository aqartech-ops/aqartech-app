// Print templates (قوالب الطباعة) — pure rules, unit-tested. The app renders templates (services/printTemplate.js);
// the server only checks that what the platform team saves can be rendered.

export const PAPERS = ['A4', 'A5'] as const;
export const FILTERS = ['money', 'date'] as const;
export const MAX_BODY = 20_000;
export const MAX_SIGNATURES = 4;

/** Inside {{ }}: a field path ("name", "tenant.phone", "company.name", "parking_no") and an optional "| money" / "| date". */
const PLACEHOLDER = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?(\s*\|\s*(money|date))?$/;

export type TemplateCheck = { ok: true } | { ok: false; code: string; detail?: string };

/** Every {{…}} is well formed and closed. Returns the first problem found. */
export function checkBody(body: string): TemplateCheck {
  if (body.length > MAX_BODY) return { ok: false, code: 'validation.tooLong' };
  let rest = body;
  for (;;) {
    const open = rest.indexOf('{{');
    const close = rest.indexOf('}}');
    if (open < 0) return close < 0 ? { ok: true } : { ok: false, code: 'templates.badPlaceholder', detail: '}}' };
    const end = rest.indexOf('}}', open + 2);
    if (end < 0) return { ok: false, code: 'templates.badPlaceholder', detail: rest.slice(open, open + 30) };
    if (close >= 0 && close < open) return { ok: false, code: 'templates.badPlaceholder', detail: '}}' };
    const inner = rest.slice(open + 2, end).trim();
    if (!PLACEHOLDER.test(inner)) return { ok: false, code: 'templates.badPlaceholder', detail: `{{${inner}}}` };
    rest = rest.slice(end + 2);
  }
}

/** Placeholders used by a body (paths only, no filter), e.g. to know if the balance must be loaded. */
export function placeholders(body: string): string[] {
  return [...body.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*(?:\|\s*\w+\s*)?\}\}/g)].map((m) => m[1]);
}

export type Signature = { labelAr: string; labelEn: string };

/** Signature lines at the bottom of the page: up to 4, each with an Arabic and an English label. */
export function checkSignatures(input: unknown): { ok: true; value: Signature[] } | { ok: false; code: string } {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input) || input.length > MAX_SIGNATURES) return { ok: false, code: 'validation.invalid' };
  const value: Signature[] = [];
  for (const raw of input) {
    const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const labelAr = typeof item.labelAr === 'string' ? item.labelAr.trim() : '';
    const labelEn = typeof item.labelEn === 'string' ? item.labelEn.trim() : '';
    if (!labelAr && !labelEn) continue;
    if (labelAr.length > 40 || labelEn.length > 40) return { ok: false, code: 'validation.tooLong' };
    value.push({ labelAr: labelAr || labelEn, labelEn: labelEn || labelAr });
  }
  return { ok: true, value };
}
