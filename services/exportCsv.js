import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

// Export to Excel (تصدير Excel): a UTF-8 CSV file with a BOM, which Excel opens directly with Arabic intact.
// Web: downloaded by the browser. Phone/tablet: shared (save to Files, WhatsApp, email…).

const cell = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Money as a plain number with 3 decimals (Excel can sum it); amounts are integer baisa. */
export const omr = (baisa) => (baisa === null || baisa === undefined ? '' : (baisa / 1000).toFixed(3));

/** ISO date "2026-03-01" (Excel recognises it as a date). */
export const day = (value) => (value ? String(value).slice(0, 10) : '');

export function toCsv(rows) {
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`;
}

export async function exportCsv(filename, rows) {
  const name = `${filename.replace(/[^\w؀-ۿ-]+/g, '_')}.csv`;
  const csv = toCsv(rows);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: name });
  }
}
