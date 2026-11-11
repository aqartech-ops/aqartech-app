import { formatOMR } from './money';
import { esc } from './html';

// Monthly property report helpers — pure (no React Native), shared by the dashboard and the printed report.

export const AGING_KEYS = ['0_30', '31_60', '61_90', '90_plus'];
export const AGING_COLORS = { '0_30': '#1F8A5B', '31_60': '#E0A030', '61_90': '#D9772B', '90_plus': '#B03A2E' };
const BAR_COLORS = ['#1F6E66', '#2B6CB0', '#8F6A4C', '#6B7A8F', '#B7791F'];

const amount = (baisa, lang) => formatOMR(baisa ?? 0, lang, { withCurrency: false });
/** A number inside Arabic text keeps its sign and % in place. */
const num = (text) => `<bdi dir="ltr">${esc(text)}</bdi>`;
export const pctText = (v) => (v === null || v === undefined ? '—' : `${v}%`);

/** This month and the ones before it: ["2026-11", "2026-10", …]. */
export function recentMonths(count, now = new Date()) {
  // the calendar month in Oman (UTC+4)
  const local = new Date(now.getTime() + 4 * 3600_000);
  let y = local.getUTCFullYear();
  let m = local.getUTCMonth() + 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** "2026-06" → "June 2026" / "يونيو 2026". */
export function monthLabel(key, t) {
  if (!key) return '';
  const [y, m] = key.split('-');
  return `${t(`report.months.${Number(m)}`)} ${y}`;
}

/** "Performance overview": a paragraph written from the numbers. */
export function overviewText(data, name, t, lang) {
  const parts = [];
  const occ = data.kpis?.occupancy?.value;
  const f = data.financial;
  const hasOcc = occ !== undefined && data.kpis?.occupancy;
  if (hasOcc && f) parts.push(t('report.story.main', { name, occupancy: pctText(occ), income: amount(f.totalIncome, lang), noi: amount(f.noi, lang) }));
  else if (hasOcc) parts.push(t('report.story.occupancy', { name, occupancy: pctText(occ) }));
  else if (f) parts.push(t('report.story.income', { income: amount(f.totalIncome, lang), noi: amount(f.noi, lang) }));
  if (data.collection) parts.push(t('report.story.collection', { rate: pctText(data.collection.rate), arrears: amount(data.aging?.total ?? 0, lang) }));
  if (data.occupancy) {
    const u = data.occupancy.units;
    parts.push(t('report.story.vacant', { vacant: data.occupancy.vacant.total, total: u.total, residential: u.residential, commercial: u.commercial }));
  }
  if (data.maintenance && data.workOrders) parts.push(t('report.story.maintenance', { amount: amount(data.maintenance.total, lang), count: data.workOrders.opened, open: data.workOrders.open }));
  else if (data.maintenance) parts.push(t('report.story.maintenanceSpend', { amount: amount(data.maintenance.total, lang) }));
  else if (data.workOrders) parts.push(t('report.story.workOrders', { count: data.workOrders.opened, open: data.workOrders.open }));
  return parts.join(' ');
}

// ---------------------------------------------------------------- printed report (one page per building)

function svgBars(bars, lang) {
  const W = 300;
  const H = 140;
  const base = 114;
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)));
  const slot = W / Math.max(1, bars.length);
  const bw = Math.min(70, slot * 0.6);
  const grid = [0.25, 0.5, 0.75, 1].map((g) => `<line x1="0" x2="${W}" y1="${base - g * 92}" y2="${base - g * 92}" stroke="#E6E1DA" stroke-width="1"/>`).join('');
  const rects = bars
    .map((b, i) => {
      const h = Math.max(b.value ? 2 : 0, (Math.abs(b.value) / max) * 92);
      const x = slot * i + (slot - bw) / 2;
      return `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="3" fill="${b.color}"/>
        <text x="${x + bw / 2}" y="${base - h - 5}" font-size="10" text-anchor="middle" fill="#3E3228" font-weight="600">${esc(amount(b.value, lang))}</text>
        <text x="${x + bw / 2}" y="${base + 16}" font-size="9.5" text-anchor="middle" fill="#7A6E64">${esc(b.label)}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg">${grid}<line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#BFB5A9"/>${rects}</svg>`;
}

function svgDonut(items) {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = total
    ? items
        .filter((i) => i.value > 0)
        .map((i) => {
          const len = (i.value / total) * c;
          const arc = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${i.color}" stroke-width="24" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
          offset += len;
          return arc;
        })
        .join('')
    : '';
  return `<svg viewBox="0 0 140 140" width="118" height="118" xmlns="http://www.w3.org/2000/svg"><circle cx="70" cy="70" r="${r}" fill="none" stroke="#ECE6DE" stroke-width="24"/>${arcs}</svg>`;
}

function table(title, rows, t, lang) {
  const body = rows
    .filter(Boolean)
    .map((r) => `<tr class="${r.total ? 'total' : ''}"><td class="num ${r.value < 0 ? 'neg' : ''}">${r.value === null || r.value === undefined ? '—' : num(amount(r.value, lang))}</td><td>${esc(r.label)}</td></tr>`)
    .join('');
  return `<div class="block"><h3>${esc(title)}</h3><table><thead><tr><th class="num">${esc(t('report.amount'))}</th><th>${esc(t('report.description'))}</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function page(data, t, lang, company) {
  const info = data.info ?? {};
  const name = info.name ?? t('report.allPropertiesCount', { count: info.count ?? 0 });
  const k = data.kpis ?? {};
  const kpi = (value, label, color) => `<div class="kpi" style="border-inline-start-color:${color}"><div class="kv" style="color:${color}">${num(value)}</div><div class="kl">${esc(label)}</div></div>`;
  const kpis = [
    k.occupancy ? kpi(pctText(k.occupancy.value), t('report.kpi.occupancy'), '#2B6CB0') : '',
    k.collectionRate ? kpi(pctText(k.collectionRate.value), t('report.kpi.collection'), '#1F8A5B') : '',
    k.noi ? kpi(amount(k.noi.value, lang), t('report.kpi.noi'), '#8F6A4C') : '',
    k.arrears ? kpi(amount(k.arrears.value, lang), t('report.kpi.arrears'), '#B03A2E') : '',
  ].join('');
  const band = [
    [t('report.propertyLabel'), name],
    info.owners ? [t('report.ownerLabel'), info.owners.join('، ') || '—'] : null,
    info.address ? [t('report.addressLabel'), info.address] : null,
    [info.floors ? t('report.floorsLabel') : t('report.unitsLabel'), [info.floors ? String(info.floors) : null, t('report.unitsCount', { count: info.units?.total ?? 0 })].filter(Boolean).join(' · ')],
    [t('report.monthLabel'), monthLabel(data.month, t)],
  ]
    .filter(Boolean)
    .map(([l, v]) => `<span><b>${esc(l)}</b> ${esc(v)}</span>`)
    .join('');

  const f = data.financial;
  const c = data.cashFlow;
  const o = data.ownerStatement;
  const tables = [
    f
      ? table(
          t('report.financialTitle'),
          [
            { label: t('report.fin.rent'), value: f.rentIncome },
            { label: t('report.fin.other'), value: f.otherIncome },
            { label: t('report.fin.totalIncome'), value: f.totalIncome },
            { label: t('report.fin.maintenanceUtilities'), value: f.groups.maintenanceUtilities },
            { label: t('report.fin.staff'), value: f.groups.staff },
            { label: t('report.fin.administration'), value: f.groups.administration },
            { label: t('report.fin.noi'), value: f.noi, total: true },
          ],
          t,
          lang,
        )
      : '',
    c
      ? table(
          t('report.cashTitle'),
          [
            { label: t('report.cash.opening'), value: c.opening },
            { label: t('report.cash.cashRent'), value: c.cashRent },
            { label: t('report.cash.cheques'), value: c.chequesDeposited },
            { label: t('report.cash.other'), value: c.otherIn },
            { label: t('report.cash.payments'), value: -c.paymentsMade },
            { label: t('report.cash.remitted'), value: -c.remitted },
            { label: t('report.cash.closing'), value: c.closing, total: true },
            { label: t('report.cash.totalRent'), value: c.totalRentCollected },
          ],
          t,
          lang,
        )
      : '',
    o && o.available
      ? table(
          t('report.ownerTitle'),
          [
            { label: t('report.owner.collected'), value: o.rentCollected },
            { label: t('report.owner.expenses'), value: -o.ownerExpenses },
            { label: t('report.owner.fee'), value: -o.managementFee },
            { label: t('report.owner.net'), value: o.net, total: true },
            { label: t('report.owner.remitted'), value: -o.remitted },
            { label: t('report.owner.balance'), value: o.balance, total: true },
          ],
          t,
          lang,
        )
      : '',
  ].join('');

  const charts = [];
  if (data.receivables) {
    charts.push(
      `<div class="block chart"><h3>${esc(t('report.receivablesTitle'))} <small>${esc(t('report.totalLabel'))}: ${esc(amount(data.receivables.total, lang))}</small></h3>${svgBars(
        [
          { label: t('report.collectedMonth'), value: data.receivables.collected, color: '#1F8A5B' },
          { label: t('report.arrearsTotal'), value: data.receivables.arrears, color: '#B03A2E' },
        ],
        lang,
      )}</div>`,
    );
  }
  if (data.aging) {
    const items = AGING_KEYS.map((b) => ({ label: t(`report.aging.${b}`), value: data.aging.buckets[b] ?? 0, color: AGING_COLORS[b] }));
    const total = data.aging.total || 0;
    const legend = items
      .map((i) => `<div class="lg"><i style="background:${i.color}"></i>${esc(i.label)}: ${num(amount(i.value, lang))} ${num(`(${total ? Math.round((i.value / total) * 100) : 0}%)`)}</div>`)
      .join('');
    charts.push(`<div class="block chart"><h3>${esc(t('report.agingTitle'))} <small>${esc(t('report.totalLabel'))}: ${esc(amount(total, lang))}</small></h3><div class="donut">${svgDonut(items)}<div>${legend}</div></div></div>`);
  }
  if (data.maintenance) {
    const bars = data.maintenance.byCategory.slice(0, 5).map((m, i) => ({ label: lang === 'ar' ? m.nameAr : m.nameEn, value: m.amount, color: BAR_COLORS[i % BAR_COLORS.length] }));
    const wo = data.workOrders ? `<div class="wo">${esc(t('report.wo.opened', { count: data.workOrders.opened }))} · ${esc(t('report.wo.done', { count: data.workOrders.done }))} · ${esc(t('report.wo.open', { count: data.workOrders.open }))}</div>` : '';
    charts.push(
      `<div class="block chart"><h3>${esc(t('report.maintenanceTitle'))} <small>${esc(t('report.totalLabel'))}: ${esc(amount(data.maintenance.total, lang))}</small></h3>${bars.length ? svgBars(bars, lang) : `<p class="muted">${esc(t('report.noMaintenance'))}</p>`}${wo}</div>`,
    );
  }

  const overview = overviewText(data, name, t, lang);
  return `<section class="page">
    <header><div><h1>${esc(t('report.printTitle', { name }))}</h1><div class="muted">${esc(company ?? '')} · ${esc(monthLabel(data.month, t))}</div></div></header>
    <div class="band">${band}</div>
    <div class="kpis">${kpis}</div>
    ${overview ? `<div class="overview"><b>${esc(t('report.overviewTitle', { name }))}</b><p>${esc(overview)}</p></div>` : ''}
    <div class="grid3">${tables}</div>
    <div class="grid3">${charts.join('')}</div>
    <div class="sign"><div class="stamp">${esc(t('report.stamp'))}</div><div class="line"><span>${esc(t('report.signature'))}</span></div></div>
    <footer>${esc(company ?? '')} — ${esc(t('report.confidential'))}</footer>
  </section>`;
}

/** The printed monthly report: one landscape page per report (building). */
export function monthlyReportHtml(pages, t, lang, company) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${esc(t('report.title'))}</title>
<style>
  @page { size: A4 landscape; margin: 7mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif; color: #3E3228; margin: 0; font-size: 10.5px; }
  .page { page-break-after: always; padding: 2px; break-inside: avoid; }
  .page:last-child { page-break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #8F6A4C; padding-bottom: 6px; }
  h1 { font-size: 17px; margin: 0; color: #8F6A4C; }
  h3 { font-size: 12px; margin: 0 0 6px; }
  h3 small { font-weight: 500; color: #7A6E64; margin-inline-start: 8px; }
  .muted { color: #7A6E64; }
  .band { display: flex; flex-wrap: wrap; gap: 4px 18px; background: #8F6A4C; color: #fff; padding: 5px 10px; border-radius: 6px; margin: 6px 0; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kpi { border: 1px solid #E3D9CD; border-inline-start: 5px solid; border-radius: 6px; padding: 4px 10px; }
  .kv { font-size: 17px; font-weight: 700; }
  .kl { color: #7A6E64; }
  .overview { background: #FBF8F3; border: 1px solid #E3D9CD; border-radius: 6px; padding: 5px 10px; margin: 6px 0; }
  .overview p { margin: 4px 0 0; line-height: 1.6; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 6px; }
  .block { border: 1px solid #E3D9CD; border-radius: 6px; padding: 6px 8px; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: start; font-size: 9.5px; color: #7A6E64; border-bottom: 1px solid #E3D9CD; padding: 3px 4px; }
  td { padding: 2px 4px; border-bottom: 1px solid #F0EAE2; }
  td.num, th.num { width: 34%; text-align: center; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.neg { color: #B03A2E; }
  tr.total td { font-weight: 700; border-top: 2px solid #8F6A4C; background: #F1E7DC; }
  .donut { display: flex; align-items: center; gap: 10px; }
  .lg { display: flex; align-items: center; gap: 5px; margin: 3px 0; }
  .lg i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  .wo { color: #7A6E64; margin-top: 4px; }
  .sign { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
  .stamp { width: 78px; height: 78px; border: 1.5px dashed #BFB5A9; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #BFB5A9; }
  .line { flex: 1; margin-inline-start: 40px; border-bottom: 1px solid #3E3228; height: 34px; position: relative; max-width: 360px; }
  .line span { position: absolute; bottom: -16px; inset-inline-start: 0; color: #7A6E64; }
  footer { text-align: center; color: #7A6E64; margin-top: 10px; font-size: 9.5px; }
</style>
</head>
<body>
${pages.map((p) => page(p, t, lang, company)).join('\n')}
</body>
</html>`;
}
