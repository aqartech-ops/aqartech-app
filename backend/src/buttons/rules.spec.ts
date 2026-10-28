import { OVERRIDE_KEY, checkConfig, fillTemplate, readPath, waPhone } from './rules.js';

describe('buttons rules', () => {
  const lease = { number: 'L-2026-0001', endDate: '2027-01-31T00:00:00.000Z', tenant: { name: 'أحمد', phone: '9123 4567' }, custom: { parking_no: 'P7', tags: ['a', 'b'] } };

  it('reads core, nested and extra fields', () => {
    expect(readPath(lease, 'number')).toBe('L-2026-0001');
    expect(readPath(lease, 'tenant.phone')).toBe('9123 4567');
    expect(readPath(lease, 'parking_no')).toBe('P7');
    expect(readPath(lease, 'missing')).toBe(undefined);
    expect(readPath(null, 'x')).toBe(undefined);
  });

  it('fills templates, dates as days, encoded for links', () => {
    expect(fillTemplate('عقد {{number}} ينتهي {{endDate}}', lease)).toBe('عقد L-2026-0001 ينتهي 2027-01-31');
    expect(fillTemplate('{{ tags }} / {{nothing}}', lease)).toBe('a, b / ');
    expect(fillTemplate('https://x.om/?q={{tenant.name}}', lease, encodeURIComponent)).toBe(`https://x.om/?q=${encodeURIComponent('أحمد')}`);
  });

  it('normalizes WhatsApp numbers', () => {
    expect(waPhone('9123 4567')).toBe('96891234567');
    expect(waPhone('+968 9123-4567')).toBe('96891234567');
    expect(waPhone('0096891234567')).toBe('96891234567');
    expect(waPhone('٩١٢٣٤٥٦٧')).toBe('96891234567');
    expect(waPhone('123')).toBeNull();
    expect(waPhone(undefined)).toBeNull();
  });

  it('accepts only well-formed built-in button ids', () => {
    expect(OVERRIDE_KEY.test('tenants.add')).toBe(true);
    expect(OVERRIDE_KEY.test('leases.detail.renew')).toBe(true);
    expect(OVERRIDE_KEY.test('tenants')).toBe(false);
    expect(OVERRIDE_KEY.test('Tenants.add')).toBe(false);
    expect(OVERRIDE_KEY.test('a.b; drop')).toBe(false);
  });

  it('checks action settings', () => {
    expect(checkConfig('LINK', { url: 'https://maps.google.com/?q={{address}}' })).toEqual({ ok: true, value: { url: 'https://maps.google.com/?q={{address}}' } });
    expect(checkConfig('LINK', { url: 'javascript:alert(1)' })).toMatchObject({ ok: false, code: 'buttons.badUrl' });
    expect(checkConfig('WHATSAPP', { phoneField: 'tenant.phone', message: 'مرحبا {{tenant.name}}' })).toEqual({ ok: true, value: { phoneField: 'tenant.phone', message: 'مرحبا {{tenant.name}}' } });
    expect(checkConfig('CALL', {})).toMatchObject({ ok: false, code: 'validation.required', field: 'phoneField' });
    expect(checkConfig('CALL', { phoneField: 'a b' })).toMatchObject({ ok: false, code: 'validation.invalid' });
    expect(checkConfig('EMAIL', { emailField: 'email' })).toEqual({ ok: true, value: { emailField: 'email', subject: '', body: '' } });
    expect(checkConfig('SET_FIELD', { field: 'inspected', value: true, confirm: true })).toEqual({ ok: true, value: { field: 'inspected', value: true, confirm: true } });
    expect(checkConfig('SET_FIELD', { field: 'inspected' })).toMatchObject({ ok: false, field: 'value' });
    expect(checkConfig('NEW_RECORD', { section: 'visits', copy: [{ from: 'tenant.name', to: 'tenant_name' }] })).toEqual({
      ok: true,
      value: { section: 'visits', copy: [{ from: 'tenant.name', to: 'tenant_name' }] },
    });
    expect(checkConfig('NEW_RECORD', { section: 'visits', copy: [{ from: 'name', to: 'Bad Key' }] })).toMatchObject({ ok: false, field: 'copy' });
  });
});
