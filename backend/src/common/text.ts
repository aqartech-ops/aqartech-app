import { Prisma } from '@prisma/client';

// Search normalization (Arabic + English), shared by every search query.
// So that "احمد" finds "أحمد", "مدرسه" finds "مدرسة", "٩٩١" finds "991", and diacritics/tatweel are ignored.

// Characters mapped one-to-one (same position in FROM_MAP and TO_MAP)
const FROM_MAP = 'أإآٱىة٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const TO_MAP = 'اااايه01234567890123456789';
// Characters removed entirely: tatweel + Arabic diacritics (tashkeel)
const REMOVED = 'ـًٌٍَُِّْٰ';

export function normalizeSearch(input: string): string {
  let out = '';
  for (const ch of input.toLowerCase()) {
    if (REMOVED.includes(ch)) continue;
    const i = FROM_MAP.indexOf(ch);
    out += i >= 0 ? TO_MAP[i] : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** SQL expression that normalizes a column the same way as normalizeSearch(). `column` must be a trusted identifier. */
export function normalizedColumn(column: string): Prisma.Sql {
  if (!/^"?[A-Za-z_][A-Za-z0-9_]*"?(\."?[A-Za-z_][A-Za-z0-9_]*"?)?$/.test(column)) {
    throw new Error(`Unsafe column identifier: ${column}`);
  }
  return Prisma.raw(`translate(lower(coalesce(${column}, '')), '${FROM_MAP}${REMOVED}', '${TO_MAP}')`);
}

/** LIKE pattern "%term%" with LIKE wildcards in the user's text escaped. */
export function likePattern(term: string): string {
  return `%${normalizeSearch(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
