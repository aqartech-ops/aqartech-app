// Draft & publish (المسودة والنشر) — pure rules, unit-tested: what changed between two configurations.

export const AREAS = ['fields', 'sections', 'buttonOverrides', 'customButtons', 'templates', 'metrics'] as const;
export type Area = (typeof AREAS)[number];
export type Row = Record<string, unknown>;
export type Snapshot = Record<Area, Row[]>;

export type Change = { area: Area; kind: 'added' | 'changed' | 'removed'; id: string; labelAr: string; labelEn: string };

/** Identity of a row: its id (button overrides are keyed by the button id). */
export const idOf = (area: Area, row: Row) => String(area === 'buttonOverrides' ? row.key : row.id);

const IGNORED = new Set(['createdAt', 'updatedAt']);

/** Stable text of a row, ignoring timestamps and key order (dates become ISO text either way). */
export function fingerprint(row: Row): string {
  const norm = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Row)
          .sort()
          .map((k) => [k, norm((v as Row)[k])]),
      );
    }
    return v ?? null;
  };
  const clean = Object.fromEntries(Object.entries(row).filter(([k]) => !IGNORED.has(k)));
  return JSON.stringify(norm(clean));
}

/** Readable name of a row in the list of changes. */
export function labelOf(area: Area, row: Row): { labelAr: string; labelEn: string } {
  const s = (v: unknown) => (typeof v === 'string' && v ? v : '');
  switch (area) {
    case 'fields': {
      const key = `${s(row.entity)} › ${s(row.key)}`;
      return { labelAr: s(row.labelAr) || s(row.labelEn) || key, labelEn: s(row.labelEn) || s(row.labelAr) || key };
    }
    case 'buttonOverrides':
      return { labelAr: s(row.labelAr) || s(row.key), labelEn: s(row.labelEn) || s(row.key) };
    case 'customButtons':
      return { labelAr: s(row.labelAr), labelEn: s(row.labelEn) };
    default:
      return { labelAr: s(row.nameAr) || s(row.nameEn), labelEn: s(row.nameEn) || s(row.nameAr) };
  }
}

/** Changes from `from` (published) to `to` (draft), area by area, in the draft's order. */
export function diff(from: Partial<Snapshot>, to: Partial<Snapshot>): Change[] {
  const out: Change[] = [];
  for (const area of AREAS) {
    const before = new Map((from[area] ?? []).map((r) => [idOf(area, r), r]));
    const after = new Map((to[area] ?? []).map((r) => [idOf(area, r), r]));
    for (const [id, row] of after) {
      const old = before.get(id);
      if (!old) out.push({ area, kind: 'added', id, ...labelOf(area, row) });
      else if (fingerprint(old) !== fingerprint(row)) out.push({ area, kind: 'changed', id, ...labelOf(area, row) });
    }
    for (const [id, row] of before) if (!after.has(id)) out.push({ area, kind: 'removed', id, ...labelOf(area, row) });
  }
  return out;
}

/** Sections in an order that respects parent → sub-section (parents first). */
export function parentsFirst(rows: Row[]): Row[] {
  const done = new Set<string>();
  const out: Row[] = [];
  let pending = [...rows];
  for (let guard = 0; pending.length && guard < 10; guard += 1) {
    const next: Row[] = [];
    for (const r of pending) {
      if (!r.parentId || done.has(String(r.parentId)) || !rows.some((x) => x.id === r.parentId)) {
        out.push(r);
        done.add(String(r.id));
      } else next.push(r);
    }
    pending = next;
  }
  return [...out, ...pending];
}
