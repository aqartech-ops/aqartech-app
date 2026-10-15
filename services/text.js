// Same normalization as the server (backend/src/common/text.ts), for searching on the device:
// "احمد" matches "أحمد", "مدرسه" matches "مدرسة", "٩٩١" matches "991", diacritics/tatweel ignored.

const FROM_MAP = 'أإآٱىة٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const TO_MAP = 'اااايه01234567890123456789';
const REMOVED = 'ـًٌٍَُِّْٰ';

export function normalizeSearch(input) {
  let out = '';
  for (const ch of String(input ?? '').toLowerCase()) {
    if (REMOVED.includes(ch)) continue;
    const i = FROM_MAP.indexOf(ch);
    out += i >= 0 ? TO_MAP[i] : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function matches(text, query) {
  const q = normalizeSearch(query);
  return !!q && normalizeSearch(text).includes(q);
}
