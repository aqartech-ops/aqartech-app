// Indicators (المؤشرات) — pure rules, unit-tested: validate a definition, compute it from records.
// Computed in integer baisa for amounts: sums are exact, averages are rounded to the nearest baisa.

export const AGGREGATES = ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'] as const;
export type Aggregate = (typeof AGGREGATES)[number];
export const PERIODS = ['MONTH', 'YEAR', 'ALL'] as const;
export type Period = (typeof PERIODS)[number];

export type FieldInfo = { key: string; type: string; options?: { value: string }[] };
export type MetricDef = {
  aggregate: Aggregate;
  valueField: string | null;
  dateField: string | null;
  filterField: string | null;
  filterValue: unknown;
  groupBy: string | null;
};
export type Rec = { custom: unknown; propertyId: string | null; createdAt: Date };
export type Format = 'money' | 'number' | 'count';

const VALUE_TYPES = ['MONEY', 'NUMBER'];
const CHOICE_TYPES = ['SELECT', 'MULTISELECT', 'BOOLEAN'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const OMAN_OFFSET_MS = 4 * 60 * 60 * 1000;

type Fail = { ok: false; code: string; field: string };
const fail = (code: string, field: string): Fail => ({ ok: false, code, field });

/**
 * Check a definition against the section's extra fields.
 * `withProperty`: the section links records to a property (needed to break down by property).
 */
export function checkDefinition(src: Record<string, unknown>, fields: FieldInfo[], withProperty: boolean): { ok: true; value: MetricDef } | Fail {
  const field = (key: unknown) => (typeof key === 'string' && key ? fields.find((f) => f.key === key) : undefined);
  const aggregate = (AGGREGATES as readonly string[]).includes(String(src.aggregate)) ? (src.aggregate as Aggregate) : null;
  if (!aggregate) return fail('validation.invalid', 'aggregate');

  let valueField: string | null = null;
  if (aggregate !== 'COUNT') {
    const f = field(src.valueField);
    if (!f || !VALUE_TYPES.includes(f.type)) return fail('metrics.valueField', 'valueField');
    valueField = f.key;
  }

  let dateField: string | null = null;
  if (src.dateField) {
    const f = field(src.dateField);
    if (!f || f.type !== 'DATE') return fail('validation.invalid', 'dateField');
    dateField = f.key;
  }

  let filterField: string | null = null;
  let filterValue: unknown = null;
  if (src.filterField) {
    const f = field(src.filterField);
    if (!f || !CHOICE_TYPES.includes(f.type)) return fail('validation.invalid', 'filterField');
    if (f.type === 'BOOLEAN') {
      if (typeof src.filterValue !== 'boolean') return fail('validation.required', 'filterValue');
    } else if (typeof src.filterValue !== 'string' || !(f.options ?? []).some((o) => o.value === src.filterValue)) {
      return fail('validation.required', 'filterValue');
    }
    filterField = f.key;
    filterValue = src.filterValue;
  }

  let groupBy: string | null = null;
  if (src.groupBy) {
    if (src.groupBy === 'month') groupBy = 'month';
    else if (src.groupBy === 'property') {
      if (!withProperty) return fail('metrics.noProperty', 'groupBy');
      groupBy = 'property';
    } else {
      const f = field(src.groupBy);
      if (!f || !CHOICE_TYPES.includes(f.type)) return fail('validation.invalid', 'groupBy');
      groupBy = f.key;
    }
  }
  return { ok: true, value: { aggregate, valueField, dateField, filterField, filterValue, groupBy } };
}

/** "YYYY-MM-DD" of a timestamp in Oman. */
export function omanDay(date: Date): string {
  return new Date(date.getTime() + OMAN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Period of a dashboard indicator, as days (inclusive). ALL = no limit. */
export function periodRange(period: Period, todayDay: string): { from?: string; to?: string } {
  if (period === 'MONTH') return { from: `${todayDay.slice(0, 7)}-01`, to: todayDay };
  if (period === 'YEAR') return { from: `${todayDay.slice(0, 4)}-01-01`, to: todayDay };
  return {};
}

const customOf = (r: Rec): Record<string, unknown> => (r.custom && typeof r.custom === 'object' && !Array.isArray(r.custom) ? (r.custom as Record<string, unknown>) : {});

/** The day a record counts on: its date field, or the day it was created. Null when the date field is empty. */
export function recordDay(r: Rec, dateField: string | null): string | null {
  if (!dateField) return omanDay(r.createdAt);
  const v = customOf(r)[dateField];
  return typeof v === 'string' && DAY.test(v) ? v : null;
}

function matchesFilter(r: Rec, field: string | null, value: unknown): boolean {
  if (!field) return true;
  const v = customOf(r)[field];
  if (Array.isArray(v)) return v.includes(value);
  if (typeof value === 'boolean') return (v === true) === value;
  return v === value;
}

function groupKeys(r: Rec, def: MetricDef, day: string | null): (string | null)[] {
  if (!def.groupBy) return [];
  if (def.groupBy === 'month') return [day ? day.slice(0, 7) : null];
  if (def.groupBy === 'property') return [r.propertyId];
  const v = customOf(r)[def.groupBy];
  if (Array.isArray(v)) return v.length ? v.map(String) : [null];
  if (typeof v === 'boolean') return [String(v)];
  return [v === undefined || v === null || v === '' ? null : String(v)];
}

type Acc = { count: number; values: number[] };

function finish(def: MetricDef, acc: Acc, integer: boolean): number | null {
  if (def.aggregate === 'COUNT') return acc.count;
  if (!acc.values.length) return null;
  switch (def.aggregate) {
    case 'SUM':
      return round(acc.values.reduce((s, x) => s + x, 0), integer);
    case 'AVG':
      return round(acc.values.reduce((s, x) => s + x, 0) / acc.values.length, integer);
    case 'MIN':
      return Math.min(...acc.values);
    case 'MAX':
      return Math.max(...acc.values);
    default:
      return null;
  }
}

/** Amounts (baisa) stay whole numbers; other numbers keep 2 decimals. */
function round(x: number, integer: boolean) {
  return integer ? Math.round(x) : Math.round(x * 100) / 100;
}

export type Result = { value: number | null; count: number; groups: { key: string | null; value: number | null; count: number }[] };

/**
 * Compute an indicator.
 *  - range: days "YYYY-MM-DD" (inclusive); records with an empty date field are left out when a range is set.
 *  - valueType: type of the value field ('MONEY' | 'NUMBER'), null for COUNT.
 */
export function compute(def: MetricDef, records: Rec[], range: { from?: string; to?: string }, valueType: string | null): Result {
  const integer = valueType === 'MONEY';
  const total: Acc = { count: 0, values: [] };
  const groups = new Map<string | null, Acc>();
  for (const r of records) {
    const day = recordDay(r, def.dateField);
    if ((range.from || range.to) && (!day || (range.from && day < range.from) || (range.to && day > range.to))) continue;
    if (!matchesFilter(r, def.filterField, def.filterValue)) continue;
    let value: number | null = null;
    if (def.aggregate !== 'COUNT') {
      const raw = customOf(r)[def.valueField ?? ''];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      value = raw;
    }
    const add = (acc: Acc) => {
      acc.count += 1;
      if (value !== null) acc.values.push(value);
    };
    add(total);
    for (const key of groupKeys(r, def, day)) {
      if (!groups.has(key)) groups.set(key, { count: 0, values: [] });
      add(groups.get(key)!);
    }
  }
  const list = [...groups.entries()].map(([key, acc]) => ({ key, value: finish(def, acc, integer), count: acc.count }));
  if (def.groupBy === 'month') list.sort((a, b) => (a.key ?? '9999').localeCompare(b.key ?? '9999'));
  else list.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return { value: finish(def, total, integer), count: total.count, groups: list };
}

export function formatOf(def: Pick<MetricDef, 'aggregate'>, valueType: string | null): Format {
  if (def.aggregate === 'COUNT') return 'count';
  return valueType === 'MONEY' ? 'money' : 'number';
}
