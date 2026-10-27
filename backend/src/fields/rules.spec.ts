import { CORE_FIELDS, checkValue, coreApplies, isEmpty, mergeCustom, slugKey, type FieldDef } from './rules.js';

describe('configurable fields', () => {
  const select: FieldDef = { key: 'view', type: 'SELECT', required: false, options: [{ value: 'sea' }, { value: 'city' }] };

  it('civil ID applies to individuals, CR number to companies', () => {
    const civil = CORE_FIELDS.tenant.find((f) => f.key === 'civilId')!;
    const cr = CORE_FIELDS.tenant.find((f) => f.key === 'crNumber')!;
    expect(coreApplies(civil, 'INDIVIDUAL')).toBe(true);
    expect(coreApplies(civil, 'COMPANY')).toBe(false);
    expect(coreApplies(cr, 'COMPANY')).toBe(true);
    expect(coreApplies(cr, undefined)).toBe(false);
    expect(coreApplies(CORE_FIELDS.tenant.find((f) => f.key === 'phone')!, 'COMPANY')).toBe(true);
  });

  it('keys are stable slugs', () => {
    expect(slugKey('Parking No.')).toBe('parking_no');
    expect(slugKey('موقف')).toBe('field');
  });

  it('empty values', () => {
    expect(isEmpty('  ')).toBe(true);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(0, true)).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty(false)).toBe(false);
  });

  it('checks each type', () => {
    expect(checkValue({ key: 'a', type: 'MONEY', required: false }, 12500)).toEqual({ ok: true, value: 12500 });
    expect(checkValue({ key: 'a', type: 'MONEY', required: false }, 12.5).ok).toBe(false);
    expect(checkValue({ key: 'a', type: 'DATE', required: false }, '2026-02-28').ok).toBe(true);
    expect(checkValue({ key: 'a', type: 'DATE', required: false }, '2026-02-30').ok).toBe(false);
    expect(checkValue({ key: 'a', type: 'DATE', required: false }, '30/02/2026').ok).toBe(false);
    expect(checkValue({ key: 'a', type: 'EMAIL', required: false }, 'A@B.OM')).toEqual({ ok: true, value: 'a@b.om' });
    expect(checkValue(select, 'sea').ok).toBe(true);
    expect(checkValue(select, 'mountain').ok).toBe(false);
    expect(checkValue({ ...select, type: 'MULTISELECT' }, ['sea', 'sea', 'city'])).toEqual({ ok: true, value: ['sea', 'city'] });
    expect(checkValue({ key: 'a', type: 'BOOLEAN', required: false }, 'yes').ok).toBe(false);
    expect(checkValue({ key: 'a', type: 'TEXT', required: false }, '')).toEqual({ ok: true, value: null });
  });

  it('merges onto saved values, keeps removed fields, enforces required', () => {
    const defs: FieldDef[] = [select, { key: 'parking', type: 'TEXT', required: true }];
    const saved = { old_field: 'kept', parking: 'P1' };
    const r = mergeCustom(defs, saved, { view: 'city', unknown: 'x' }, true);
    expect(r).toEqual({ ok: true, custom: { old_field: 'kept', parking: 'P1', view: 'city' } });
    expect(mergeCustom(defs, saved, { parking: '' }, true)).toEqual({ ok: false, code: 'validation.required', field: 'custom.parking' });
    expect(mergeCustom(defs, {}, undefined, true)).toEqual({ ok: false, code: 'validation.required', field: 'custom.parking' });
    expect(mergeCustom(defs, {}, undefined, false).ok).toBe(true); // partial updates do not force new required fields
    expect(mergeCustom(defs, saved, { view: 'nope' }, true)).toEqual({ ok: false, code: 'validation.invalid', field: 'custom.view' });
  });
});
