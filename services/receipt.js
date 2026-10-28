import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Receipt (إيصال قبض) as printable HTML — printed or shared as PDF from the phone, printed from the browser on the web.

export { esc, money } from './html';
import { date, esc, money } from './html';

/** payment = GET /finance/payments/:id */
export function receiptHtml(payment, t, lang) {
  const rtl = lang === 'ar';
  const rows = [
    [t('receipt.receivedFrom'), esc(payment.tenant.name)],
    [t('receipt.forLease'), esc(`${payment.lease.number} · ${payment.lease.property.name} · ${payment.lease.unit.number}`)],
    [t('receipt.method'), esc(t(`payments.methods.${payment.method}`))],
    payment.chequeNo ? [t('payments.chequeNo'), esc(`${payment.chequeNo}${payment.bankName ? ` · ${payment.bankName}` : ''}${payment.chequeDate ? ` · ${date(payment.chequeDate, lang)}` : ''}`)] : null,
    payment.reference ? [t('payments.reference'), esc(payment.reference)] : null,
    payment.notes ? [t('payments.notes'), esc(payment.notes)] : null,
    [t('receipt.leaseBalance'), money(payment.leaseBalance, lang)],
  ].filter(Boolean);

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(payment.number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2937; margin: 0; padding: 32px; }
  .receipt { max-width: 640px; margin: 0 auto; border: 2px solid #8F6A4C; border-radius: 16px; padding: 28px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; }
  .company { font-size: 20px; font-weight: 700; }
  .muted { color: #6b7280; font-size: 13px; }
  .title { font-size: 18px; font-weight: 700; color: #8F6A4C; text-align: end; }
  .amount { margin: 24px 0; padding: 18px; background: #F1E7DC; border-radius: 12px; text-align: center; }
  .amount .money { font-size: 30px; font-weight: 700; }
  .money { display: inline-flex; align-items: center; gap: 6px; direction: ltr; font-variant-numeric: tabular-nums; }
  .rial svg { height: 0.72em; width: auto; display: block; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 9px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; font-size: 14px; }
  td:first-child { color: #6b7280; width: 38%; }
  .void { margin-top: 16px; padding: 12px; border: 2px solid #b91c1c; color: #b91c1c; border-radius: 10px; font-weight: 700; text-align: center; }
  .sign { display: flex; justify-content: space-between; margin-top: 40px; gap: 24px; }
  .sign div { flex: 1; border-top: 1px solid #9ca3af; padding-top: 6px; text-align: center; color: #6b7280; font-size: 13px; }
</style>
</head>
<body>
  <div class="receipt">
    <div class="head">
      <div>
        <div class="company">${esc(payment.company?.name)}</div>
        <div class="muted">${esc([payment.company?.phone, payment.company?.email].filter(Boolean).join(' · '))}</div>
      </div>
      <div>
        <div class="title">${esc(t('receipt.title'))}</div>
        <div class="muted" style="text-align:end">${esc(payment.number)}</div>
        <div class="muted" style="text-align:end">${esc(date(payment.date, lang))}</div>
      </div>
    </div>
    <div class="amount">${money(payment.amount, lang)}</div>
    <table>${rows.map(([k, val]) => `<tr><td>${esc(k)}</td><td>${val}</td></tr>`).join('')}</table>
    ${payment.status === 'VOIDED' ? `<div class="void">${esc(t('receipt.voided'))} — ${esc(payment.voidReason)}</div>` : ''}
    <div class="sign"><div>${esc(t('receipt.receiver'))}</div><div>${esc(t('receipt.payer'))}</div></div>
  </div>
</body>
</html>`;
}

/** Print any HTML document (phone: system print dialog; web: a new window). */
export async function printHtml(html) {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
    return;
  }
  await Print.printAsync({ html });
}

/** Share any HTML document as a PDF file (WhatsApp, email…). On the web this falls back to printing (save as PDF there). */
export async function shareHtml(html, title) {
  if (Platform.OS === 'web') return printHtml(html);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: title });
  }
}

export const printReceipt = (payment, t, lang) => printHtml(receiptHtml(payment, t, lang));
export const shareReceipt = (payment, t, lang) => shareHtml(receiptHtml(payment, t, lang), payment.number);
