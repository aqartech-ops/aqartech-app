import { date, esc, money } from './html';
import { readPath } from './recordPath';

// Print templates (قوالب الطباعة): written by the platform team, printed from record pages.
// Pure — no React Native imports — so it can be tested with plain Node.
//
// Template text (Arabic and English versions):
//   ## Heading                  → a heading line
//   - item                      → a bulleted line
//   **bold**                    → bold text
//   blank line                  → new paragraph
//   {{tenant.name}}             → a field of the record ("……" when empty, to fill by hand)
//   {{monthlyRent | money}}     → an amount in rials (values are baisa)
//   {{endDate | date}}          → a date
//   {{today}}, {{company.name}}, {{company.phone}}, {{company.email}} → on every template

/** Built-in fields offered per record page: [path, label i18n key, format]. Extra fields are added from /fields. */
export const PRINT_FIELDS = {
  tenant: [
    ['name', 'tenants.name'],
    ['civilId', 'tenants.civilId'],
    ['crNumber', 'tenants.crNumber'],
    ['nationality', 'tenants.nationality'],
    ['phone', 'tenants.phone'],
    ['email', 'tenants.email'],
    ['employer', 'tenants.employer'],
    ['balance', 'print.balance', 'money'],
    ['overdue', 'print.overdue', 'money'],
  ],
  lease: [
    ['number', 'buttons.leaseNumber'],
    ['tenant.name', 'buttons.tenantName'],
    ['tenant.civilId', 'print.tenantCivilId'],
    ['tenant.phone', 'buttons.tenantPhone'],
    ['property.name', 'buttons.propertyName'],
    ['unit.number', 'buttons.unitNumber'],
    ['startDate', 'leases.startDate', 'date'],
    ['endDate', 'leases.endDate', 'date'],
    ['monthlyRent', 'leases.monthlyRent', 'money'],
    ['deposit', 'leases.deposit', 'money'],
    ['balance', 'print.balance', 'money'],
    ['overdue', 'print.overdue', 'money'],
  ],
  owner: [
    ['name', 'owners.name'],
    ['civilId', 'owners.civilId'],
    ['crNumber', 'owners.crNumber'],
    ['phone', 'owners.phone'],
    ['email', 'owners.email'],
    ['bankName', 'owners.bankName'],
    ['accountNumber', 'owners.accountNumber'],
  ],
  property: [
    ['name', 'properties.name'],
    ['governorate', 'properties.governorate'],
    ['wilayat', 'properties.wilayat'],
    ['address', 'properties.address'],
    ['plotNumber', 'properties.plotNumber'],
    ['propertyValue', 'properties.propertyValue', 'money'],
  ],
};

export const COMMON_FIELDS = [
  ['today', 'print.today', 'date'],
  ['company.name', 'print.companyName'],
  ['company.phone', 'print.companyPhone'],
  ['company.email', 'print.companyEmail'],
];

/** Fields whose value is the receivable balance (loaded only when a template uses them). */
export const BALANCE_FIELDS = ['balance', 'overdue'];

/** Fields (paths) used by a text. */
export function usedFields(text) {
  return [...String(text ?? '').matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*(?:\|\s*\w+\s*)?\}\}/g)].map((m) => m[1]);
}

/** The text in the user's language, or the other one when it was left empty. */
export function pick(template, lang, key) {
  const ar = template[`${key}Ar`];
  const en = template[`${key}En`];
  return (lang === 'ar' ? ar || en : en || ar) || '';
}

const BLANK = '<span class="blank">……………</span>';
const isIsoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v);

/**
 * One value as HTML.
 * opts: { lang, defs (extra fields of the entity: types and option labels), formats (path → 'money' | 'date'), yes, no }
 */
function valueHtml(value, path, filter, opts) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return BLANK;
  const def = (opts.defs ?? []).find((d) => d.key === path);
  const format = filter || opts.formats?.[path] || (def?.type === 'MONEY' ? 'money' : def?.type === 'DATE' ? 'date' : null);
  if (format === 'money') return typeof value === 'number' ? money(value, opts.lang) : esc(value);
  if (format === 'date' || isIsoDate(value)) return esc(date(value, opts.lang));
  const optionText = (v) => {
    const o = (def?.options ?? []).find((x) => x.value === v);
    return o ? (opts.lang === 'ar' ? o.labelAr : o.labelEn) || v : v;
  };
  if (Array.isArray(value)) return esc(value.map(optionText).join(opts.lang === 'ar' ? '، ' : ', '));
  if (typeof value === 'boolean') return esc(value ? opts.yes ?? '✓' : opts.no ?? '✗');
  if (typeof value === 'object') return BLANK;
  return esc(optionText(value));
}

/** Bold + placeholders inside one (already escaped) line. */
function inline(line, data, opts) {
  return line
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*(?:\|\s*(money|date)\s*)?\}\}/g, (_m, path, filter) => valueHtml(readPath(data, path), path, filter, opts));
}

/** Template text → HTML (headings, bullets, paragraphs). Everything typed is escaped first. */
export function renderText(text, data, opts) {
  const out = [];
  let para = [];
  let list = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${li}</li>`).join('')}</ul>`);
    para = [];
    list = [];
  };
  for (const raw of esc(String(text ?? '').replace(/\r\n/g, '\n')).split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
    } else if (/^\s*##\s+/.test(line)) {
      flush();
      out.push(`<h2>${inline(line.replace(/^\s*##\s+/, ''), data, opts)}</h2>`);
    } else if (/^\s*-\s+/.test(line)) {
      if (para.length) flush();
      list.push(inline(line.replace(/^\s*-\s+/, ''), data, opts));
    } else {
      if (list.length) flush();
      para.push(inline(line, data, opts));
    }
  }
  flush();
  return out.join('\n');
}

/** Formats of the built-in fields of an entity: { path: 'money' | 'date' }. */
export function fieldFormats(entity) {
  return Object.fromEntries([...(PRINT_FIELDS[entity] ?? []), ...COMMON_FIELDS].filter((f) => f[2]).map((f) => [f[0], f[2]]));
}

/**
 * The full printable page.
 *  - template: a PrintTemplate row
 *  - data: the record + { today, company, balance?, overdue? }
 *  - opts: { lang, entity, defs, yes, no }
 */
export function templateHtml(template, data, opts) {
  const lang = opts.lang;
  const rtl = lang === 'ar';
  const o = { ...opts, formats: fieldFormats(opts.entity) };
  const title = pick(template, lang, 'title');
  const signatures = (template.signatures ?? []).map((s) => (rtl ? s.labelAr : s.labelEn) || s.labelAr || s.labelEn);
  const company = data.company ?? {};
  const contact = [company.phone, company.email].filter(Boolean).join(' · ');
  const paper = template.paper === 'A5' ? 'A5' : 'A4';

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(pick(template, lang, 'name'))}</title>
<style>
  @page { size: ${paper}; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2937; margin: 0; padding: 24px; line-height: 1.7; font-size: ${paper === 'A5' ? 13 : 15}px; }
  .doc { max-width: 760px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #8F6A4C; padding-bottom: 12px; margin-bottom: 20px; }
  .company { font-size: 1.35em; font-weight: 700; }
  .muted { color: #6b7280; font-size: 0.85em; }
  h1 { font-size: 1.3em; color: #8F6A4C; text-align: center; margin: 8px 0 18px; }
  h2 { font-size: 1.05em; margin: 18px 0 6px; }
  p { margin: 0 0 12px; }
  ul { margin: 0 0 12px; padding-inline-start: 22px; }
  .money { display: inline-flex; align-items: center; gap: 4px; direction: ltr; font-variant-numeric: tabular-nums; font-weight: 600; }
  .rial svg { height: 0.72em; width: auto; display: block; }
  .blank { color: #9ca3af; letter-spacing: 1px; }
  .sign { display: flex; justify-content: space-between; margin-top: 56px; gap: 24px; }
  .sign div { flex: 1; border-top: 1px solid #9ca3af; padding-top: 6px; text-align: center; color: #6b7280; font-size: 0.85em; }
</style>
</head>
<body>
  <div class="doc">
    <div class="head">
      <div>
        <div class="company">${esc(company.name)}</div>
        ${contact ? `<div class="muted">${esc(contact)}</div>` : ''}
      </div>
      <div class="muted">${esc(date(data.today, lang))}</div>
    </div>
    ${title ? `<h1>${inline(esc(title), data, o)}</h1>` : ''}
    ${renderText(pick(template, lang, 'body'), data, o)}
    ${signatures.length ? `<div class="sign">${signatures.map((s) => `<div>${esc(s)}</div>`).join('')}</div>` : ''}
  </div>
</body>
</html>`;
}
