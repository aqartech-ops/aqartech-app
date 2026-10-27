import { esc, money } from './receipt';

// Owner statement (كشف حساب المالك) as printable HTML — printed or shared as PDF like receipts.

const date = (value, lang) => (value ? new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { timeZone: 'UTC' }) : '');

/** st = GET /finance/owner-statements/:id (issued) — the numbers come from its saved snapshot. */
export function ownerStatementHtml(st, t, lang) {
  const rtl = lang === 'ar';
  const d = st.details ?? {};
  const name = (c) => (c ? (lang === 'ar' ? c.nameAr : c.nameEn) : '');
  const leaseRows = (d.leases ?? [])
    .map((l) => `<tr><td>${esc(`${l.unit} · ${l.tenant}`)}<div class="muted">${esc(l.number)}</div></td><td class="num">${money(l.due, lang)}</td><td class="num">${money(l.collected, lang)}</td></tr>`)
    .join('');
  const expenseRows = (d.expenses ?? [])
    .map((e) => `<tr><td>${esc(e.description)}<div class="muted">${esc([date(e.date, lang), name(e.category), e.unit, e.number].filter(Boolean).join(' · '))}</div></td><td class="num">${money(e.amount, lang)}</td></tr>`)
    .join('');
  const splitRows = (d.splits ?? [])
    .map((p) => `<tr><td>${esc(p.name)} <span class="muted">(${(p.shareBp / 100).toLocaleString('en', { maximumFractionDigits: 2 })}%)</span></td><td class="num">${money(p.amount, lang)}</td></tr>`)
    .join('');
  const feeRule =
    d.agreement?.feeMethod === 'FIXED'
      ? t('ownerStatements.feeFixed')
      : d.agreement
        ? t(`ownerStatements.feeRule.${d.agreement.feeMethod}`, { rate: (d.agreement.feeRateBp ?? 0) / 100 })
        : t('ownerStatements.noAgreement');

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(st.number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2937; margin: 0; padding: 28px; font-size: 13px; }
  .doc { max-width: 760px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #8F6A4C; padding-bottom: 12px; margin-bottom: 16px; }
  .company { font-size: 20px; font-weight: 700; }
  .title { font-size: 18px; font-weight: 700; color: #8F6A4C; text-align: end; }
  .muted { color: #6b7280; font-size: 12px; }
  h3 { font-size: 14px; margin: 18px 0 6px; color: #8F6A4C; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 7px 4px; border-bottom: 1px solid #f0ebe4; text-align: start; vertical-align: top; }
  th { font-size: 12px; color: #6b7280; font-weight: 600; }
  .num { text-align: end; white-space: nowrap; }
  .money { display: inline-flex; align-items: center; gap: 4px; direction: ltr; font-variant-numeric: tabular-nums; }
  .rial svg { height: 0.72em; width: auto; display: block; }
  .summary td { font-size: 14px; }
  .total td { font-weight: 700; font-size: 16px; border-top: 2px solid #8F6A4C; }
  .void { margin: 12px 0; padding: 10px; border: 2px solid #b91c1c; color: #b91c1c; border-radius: 8px; font-weight: 700; text-align: center; }
</style>
</head>
<body>
<div class="doc">
  <div class="head">
    <div>
      <div class="company">${esc(st.company?.name)}</div>
      <div class="muted">${esc([st.company?.phone, st.company?.email].filter(Boolean).join(' · '))}</div>
    </div>
    <div>
      <div class="title">${esc(t('ownerStatements.title'))}</div>
      <div class="muted" style="text-align:end">${esc(st.number)}</div>
      <div class="muted" style="text-align:end">${esc(`${date(st.periodStart, lang)} → ${date(st.periodEnd, lang)}`)}</div>
    </div>
  </div>
  <div><strong>${esc(st.property?.name)}</strong> · ${esc(st.owner?.name ?? '')}</div>
  ${st.status === 'VOIDED' ? `<div class="void">${esc(t('payments.voided'))} — ${esc(st.voidReason)}</div>` : ''}

  <h3>${esc(t('ownerStatements.summary'))}</h3>
  <table class="summary">
    <tr><td>${esc(t('ownerStatements.rentCollected'))}</td><td class="num">${money(st.rentCollected, lang)}</td></tr>
    <tr><td>− ${esc(t('ownerStatements.ownerExpenses'))}</td><td class="num">${money(st.ownerExpenses, lang)}</td></tr>
    <tr><td>− ${esc(t('ownerStatements.fee'))} <span class="muted">(${esc(feeRule)})</span></td><td class="num">${money(st.feeAmount, lang)}</td></tr>
    <tr class="total"><td>${esc(t('ownerStatements.net'))}</td><td class="num">${money(st.net, lang)}</td></tr>
  </table>

  ${splitRows ? `<h3>${esc(t('ownerStatements.splits'))}</h3><table>${splitRows}</table>` : ''}

  <h3>${esc(t('ownerStatements.byUnit'))}</h3>
  <table>
    <tr><th>${esc(t('expenses.unit'))}</th><th class="num">${esc(t('ownerStatements.due'))}</th><th class="num">${esc(t('ownerStatements.collected'))}</th></tr>
    ${leaseRows || `<tr><td colspan="3" class="muted">—</td></tr>`}
  </table>

  <h3>${esc(t('ownerStatements.ownerExpenses'))}</h3>
  <table>${expenseRows || `<tr><td class="muted">${esc(t('ownerStatements.noExpenses'))}</td></tr>`}</table>

  <p class="muted" style="margin-top:20px">${esc(t('ownerStatements.basisNote'))}</p>
</div>
</body>
</html>`;
}
