import { checkDefinition, compute, formatOf, omanDay, periodRange, recordDay, type MetricDef, type Rec } from './rules.js';

const fields = [
  { key: 'cost', type: 'MONEY' },
  { key: 'hours', type: 'NUMBER' },
  { key: 'visit_date', type: 'DATE' },
  { key: 'kind', type: 'SELECT', options: [{ value: 'ac' }, { value: 'plumbing' }] },
  { key: 'tags', type: 'MULTISELECT', options: [{ value: 'urgent' }, { value: 'night' }] },
  { key: 'paid', type: 'BOOLEAN' },
  { key: 'note', type: 'TEXT' },
];

const rec = (custom: Record<string, unknown>, propertyId: string | null = null, created = '2026-10-10T08:00:00Z'): Rec => ({ custom, propertyId, createdAt: new Date(created) });
const def = (d: Partial<MetricDef>): MetricDef => ({ aggregate: 'SUM', valueField: 'cost', dateField: 'visit_date', filterField: null, filterValue: null, groupBy: null, ...d });

describe('indicators', () => {
  it('validates definitions against the section fields', () => {
    expect(checkDefinition({ aggregate: 'SUM', valueField: 'cost', dateField: 'visit_date', groupBy: 'kind' }, fields, false)).toEqual({
      ok: true,
      value: { aggregate: 'SUM', valueField: 'cost', dateField: 'visit_date', filterField: null, filterValue: null, groupBy: 'kind' },
    });
    expect(checkDefinition({ aggregate: 'COUNT', valueField: 'note' }, fields, false)).toMatchObject({ ok: true });
    expect(checkDefinition({ aggregate: 'SUM', valueField: 'note' }, fields, false)).toMatchObject({ ok: false, field: 'valueField' });
    expect(checkDefinition({ aggregate: 'SUM' }, fields, false)).toMatchObject({ ok: false, field: 'valueField' });
    expect(checkDefinition({ aggregate: 'MEDIAN' }, fields, false)).toMatchObject({ ok: false, field: 'aggregate' });
    expect(checkDefinition({ aggregate: 'COUNT', dateField: 'note' }, fields, false)).toMatchObject({ ok: false, field: 'dateField' });
    expect(checkDefinition({ aggregate: 'COUNT', filterField: 'kind', filterValue: 'roof' }, fields, false)).toMatchObject({ ok: false, field: 'filterValue' });
    expect(checkDefinition({ aggregate: 'COUNT', filterField: 'paid', filterValue: false }, fields, false)).toMatchObject({ ok: true });
    expect(checkDefinition({ aggregate: 'COUNT', filterField: 'paid', filterValue: 'yes' }, fields, false)).toMatchObject({ ok: false });
    expect(checkDefinition({ aggregate: 'COUNT', groupBy: 'property' }, fields, false)).toMatchObject({ ok: false, code: 'metrics.noProperty' });
    expect(checkDefinition({ aggregate: 'COUNT', groupBy: 'property' }, fields, true)).toMatchObject({ ok: true });
    expect(checkDefinition({ aggregate: 'COUNT', groupBy: 'note' }, fields, true)).toMatchObject({ ok: false, field: 'groupBy' });
  });

  it('works out periods and record days in Oman time', () => {
    expect(periodRange('MONTH', '2026-10-28')).toEqual({ from: '2026-10-01', to: '2026-10-28' });
    expect(periodRange('YEAR', '2026-10-28')).toEqual({ from: '2026-01-01', to: '2026-10-28' });
    expect(periodRange('ALL', '2026-10-28')).toEqual({});
    expect(omanDay(new Date('2026-10-31T21:00:00Z'))).toBe('2026-11-01');
    expect(recordDay(rec({ visit_date: '2026-09-02' }), 'visit_date')).toBe('2026-09-02');
    expect(recordDay(rec({}), 'visit_date')).toBeNull();
    expect(recordDay(rec({}, null, '2026-10-31T21:00:00Z'), null)).toBe('2026-11-01');
  });

  const records = [
    rec({ cost: 12500, hours: 1.5, visit_date: '2026-10-01', kind: 'ac', tags: ['urgent', 'night'], paid: true }, 'p1'),
    rec({ cost: 7500, hours: 2, visit_date: '2026-10-15', kind: 'plumbing', tags: ['urgent'], paid: false }, 'p2'),
    rec({ cost: 1001, visit_date: '2026-09-30', kind: 'ac', paid: false }, 'p1'),
    rec({ hours: 3, visit_date: '2026-10-20', kind: 'ac' }, null),
    rec({ cost: 999, kind: 'ac' }, 'p1'), // no date
  ];

  it('sums amounts exactly in baisa, inside the period', () => {
    expect(compute(def({}), records, { from: '2026-10-01', to: '2026-10-31' }, 'MONEY')).toEqual({ value: 20000, count: 2, groups: [] });
    expect(compute(def({}), records, {}, 'MONEY').value).toBe(22000);
  });

  it('counts, averages (rounded to baisa), min and max', () => {
    expect(compute(def({ aggregate: 'COUNT', valueField: null }), records, { from: '2026-10-01' }, null).value).toBe(3);
    expect(compute(def({ aggregate: 'AVG' }), records, { from: '2026-09-01' }, 'MONEY').value).toBe(7000);
    expect(compute(def({ aggregate: 'AVG', valueField: 'hours' }), records, {}, 'NUMBER').value).toBe(2.17);
    expect(compute(def({ aggregate: 'MIN' }), records, {}, 'MONEY').value).toBe(999);
    expect(compute(def({ aggregate: 'MAX' }), records, {}, 'MONEY').value).toBe(12500);
    expect(compute(def({ aggregate: 'SUM' }), [], {}, 'MONEY')).toEqual({ value: null, count: 0, groups: [] });
  });

  it('filters by a choice field', () => {
    // an empty yes/no field counts as "no"
    expect(compute(def({ filterField: 'paid', filterValue: false }), records, {}, 'MONEY').value).toBe(9500);
    expect(compute(def({ filterField: 'kind', filterValue: 'ac' }), records, {}, 'MONEY').value).toBe(14500);
    expect(compute(def({ aggregate: 'COUNT', valueField: null, filterField: 'tags', filterValue: 'night' }), records, {}, null).value).toBe(1);
  });

  it('breaks down by month, property and choice fields', () => {
    expect(compute(def({ groupBy: 'month' }), records, {}, 'MONEY').groups).toEqual([
      { key: '2026-09', value: 1001, count: 1 },
      { key: '2026-10', value: 20000, count: 2 },
      { key: null, value: 999, count: 1 },
    ]);
    expect(compute(def({ groupBy: 'property', dateField: null }), records, {}, 'MONEY').groups).toEqual([
      { key: 'p1', value: 14500, count: 3 },
      { key: 'p2', value: 7500, count: 1 },
    ]);
    expect(compute(def({ aggregate: 'COUNT', valueField: null, groupBy: 'tags' }), records, {}, null).groups).toEqual([
      { key: null, value: 3, count: 3 },
      { key: 'urgent', value: 2, count: 2 },
      { key: 'night', value: 1, count: 1 },
    ]);
  });

  it('knows how to show the value', () => {
    expect(formatOf({ aggregate: 'COUNT' }, 'MONEY')).toBe('count');
    expect(formatOf({ aggregate: 'SUM' }, 'MONEY')).toBe('money');
    expect(formatOf({ aggregate: 'AVG' }, 'NUMBER')).toBe('number');
  });
});
