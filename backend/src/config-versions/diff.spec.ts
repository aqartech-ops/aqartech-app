import { diff, fingerprint, parentsFirst } from './diff.js';

describe('draft & publish — changes', () => {
  const published = {
    fields: [
      { id: 'f1', entity: 'tenant', key: 'parking', labelAr: 'الموقف', labelEn: 'Parking', required: false, options: [{ value: 'a' }], updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'f2', entity: 'lease', key: 'notes', labelEn: 'Notes' },
    ],
    sections: [{ id: 's1', key: 'visits', nameAr: 'الزيارات', nameEn: 'Visits', isActive: true }],
    buttonOverrides: [{ key: 'tenants.add', labelAr: 'جديد', hidden: false }],
    customButtons: [],
    templates: [],
    metrics: [],
  };

  it('finds nothing when only timestamps or key order differ', () => {
    const same = {
      ...published,
      fields: [
        { options: [{ value: 'a' }], required: false, labelEn: 'Parking', labelAr: 'الموقف', key: 'parking', entity: 'tenant', id: 'f1', updatedAt: new Date('2026-05-05') },
        published.fields[1],
      ],
    };
    expect(diff(published, same)).toEqual([]);
    expect(fingerprint({ a: 1, b: undefined })).toBe(fingerprint({ b: null, a: 1 }));
  });

  it('lists added, changed and removed rows with readable names', () => {
    const draft = {
      ...published,
      fields: [{ ...published.fields[0], required: true }],
      sections: [...published.sections, { id: 's2', key: 'keys', nameAr: 'المفاتيح', nameEn: 'Keys' }],
      buttonOverrides: [{ key: 'tenants.add', labelAr: 'جديد', hidden: true }],
      metrics: [{ id: 'm1', nameAr: 'تكلفة', nameEn: 'Cost' }],
    };
    expect(diff(published, draft)).toEqual([
      { area: 'fields', kind: 'changed', id: 'f1', labelAr: 'الموقف', labelEn: 'Parking' },
      { area: 'fields', kind: 'removed', id: 'f2', labelAr: 'Notes', labelEn: 'Notes' },
      { area: 'sections', kind: 'added', id: 's2', labelAr: 'المفاتيح', labelEn: 'Keys' },
      { area: 'buttonOverrides', kind: 'changed', id: 'tenants.add', labelAr: 'جديد', labelEn: 'tenants.add' },
      { area: 'metrics', kind: 'added', id: 'm1', labelAr: 'تكلفة', labelEn: 'Cost' },
    ]);
  });

  it('treats a missing area as empty', () => {
    expect(diff({}, { templates: [{ id: 't1', nameAr: 'إنذار', nameEn: 'Notice' }] })).toEqual([{ area: 'templates', kind: 'added', id: 't1', labelAr: 'إنذار', labelEn: 'Notice' }]);
  });

  it('orders sections parents first', () => {
    const rows = [
      { id: 'c', parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'a', parentId: null },
      { id: 'x', parentId: 'gone' },
    ];
    expect(parentsFirst(rows).map((r) => r.id)).toEqual(['a', 'x', 'b', 'c']);
  });
});
