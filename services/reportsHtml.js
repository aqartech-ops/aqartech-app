import { esc, money } from './receipt';

// Printable reports (قائمة الدخل، مقارنة العقارات) — printed or shared as PDF like receipts.

const date = (value, lang) => (value ? new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { timeZone: 'UTC' }) : '');
const pctText = (v) => (v === null || v === undefined ? '—' : `${v}%`);

function page(title, subtitle, company, body, lang) {
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2937; margin: 0; padding: 24px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #8F6A4C; padding-bottom: 10px; margin-bottom: 14px; }
  .title { font-size: 18px; font-weight: 700; color: #8F6A4C; }
  .muted { color: #6b7280; }
  h3 { font-size: 13px; margin: 16px 0 6px; color: #8F6A4C; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 4px; border-bottom: 1px solid #f0ebe4; text-align: start; vertical-align: top; }
  th { color: #6b7280; font-weight: 600; font-size: 11px; }
  .num { text-align: end; white-space: nowrap; }
  .money { display: inline-flex; align-items: center; gap: 3px; direction: ltr; font-variant-numeric: tabular-nums; }
  .rial svg { height: 0.72em; width: auto; display: block; }
  .total td { font-weight: 700; border-top: 2px solid #8F6A4C; }
</style>
</head>
<body>
  <div class="head">
    <div><div class="title">${esc(title)}</div><div class="muted">${esc(subtitle)}</div></div>
    <div class="muted" style="text-align:end">${esc(company ?? '')}</div>
  </div>
  ${body}
</body>
</html>`;
}

export function incomeReportHtml(r, t, lang, { company, propertyName } = {}) {
  const row = (label, amount, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td><td class="num">${money(amount, lang)}</td></tr>`;
  const cat = (c) => (c ? (lang === 'ar' ? c.nameAr : c.nameEn) : '—');
  const body = `
  <table>
    ${row(t('reports.rentIncome'), r.rentIncome)}
    ${row(t('reports.otherIncome'), r.otherIncome)}
    ${row(t('reports.operatingIncome'), r.operatingIncome, 'total')}
    ${row(`− ${t('reports.expenses')}`, r.expenses)}
    ${row(`${t('reports.noi')} (${pctText(r.noiMargin)})`, r.noi, 'total')}
    ${row(t('reports.managementFees'), r.managementFees)}
    ${row(`− ${t('reports.ownerShare')}`, r.ownerShare)}
    ${row(t('reports.companyProfit'), r.companyProfit, 'total')}
  </table>
  <h3>${esc(t('reports.expensesByCategory'))}</h3>
  <table>${r.expensesByCategory.map((c) => row(cat(c.category), c.amount)).join('') || `<tr><td class="muted">—</td></tr>`}</table>
  <h3>${esc(t('reports.monthly'))}</h3>
  <table>
    <tr><th>${esc(t('reports.month'))}</th><th class="num">${esc(t('reports.operatingIncome'))}</th><th class="num">${esc(t('reports.expenses'))}</th><th class="num">${esc(t('reports.noi'))}</th></tr>
    ${r.monthly.map((m) => `<tr><td>${esc(m.month)}</td><td class="num">${money(m.income, lang)}</td><td class="num">${money(m.expenses, lang)}</td><td class="num">${money(m.noi, lang)}</td></tr>`).join('')}
  </table>`;
  const subtitle = `${date(r.from, lang)} → ${date(r.to, lang)} · ${propertyName ?? t('reports.allProperties')}`;
  return page(t('reports.incomeTitle'), subtitle, company, body, lang);
}

export function propertiesReportHtml(r, t, lang, { company } = {}) {
  const head = ['reports.property', 'reports.units', 'reports.operatingIncome', 'reports.expenses', 'reports.noi', 'reports.noiMargin', 'reports.capRate', 'reports.roi', 'reports.occupancy', 'reports.collectionRate', 'reports.avgVacantDays', 'reports.renewalRate', 'reports.maintenancePerUnit']
    .map((k, i) => `<th class="${i > 0 ? 'num' : ''}">${esc(t(k))}</th>`)
    .join('');
  const rows = r.properties
    .map(
      (p) => `<tr><td>${esc(p.name)}</td><td class="num">${p.units}</td><td class="num">${money(p.rentIncome + p.otherIncome, lang)}</td><td class="num">${money(p.expenses, lang)}</td><td class="num">${money(p.noi, lang)}</td><td class="num">${pctText(p.noiMargin)}</td><td class="num">${pctText(p.capRate)}</td><td class="num">${pctText(p.roi)}</td><td class="num">${pctText(p.occupancy)}</td><td class="num">${pctText(p.collectionRate)}</td><td class="num">${p.avgVacantDays ?? '—'}</td><td class="num">${pctText(p.renewalRate)}</td><td class="num">${p.maintenancePerUnit === null ? '—' : money(p.maintenancePerUnit, lang)}</td></tr>`,
    )
    .join('');
  const tt = r.totals;
  const total = `<tr class="total"><td>${esc(t('finance.total'))}</td><td class="num">${tt.units}</td><td class="num">${money(tt.rentIncome + tt.otherIncome, lang)}</td><td class="num">${money(tt.expenses, lang)}</td><td class="num">${money(tt.noi, lang)}</td><td class="num">${pctText(tt.noiMargin)}</td><td colspan="7"></td></tr>`;
  const subtitle = `${r.year}${r.partialYear ? ` · ${t('reports.untilDate', { date: date(r.to, lang) })}` : ''}`;
  return page(t('reports.propertiesTitle'), subtitle, company, `<table>${`<tr>${head}</tr>`}${rows}${total}</table><p class="muted">${esc(t('reports.formulas'))}</p>`, lang);
}
