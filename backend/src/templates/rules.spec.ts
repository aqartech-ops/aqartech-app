import { checkBody, checkSignatures, placeholders } from './rules.js';

describe('print template rules', () => {
  it('accepts well-formed placeholders', () => {
    expect(checkBody('')).toEqual({ ok: true });
    expect(checkBody('السيد {{tenant.name}} المحترم،\nالمبلغ {{ overdue | money }} حتى {{today|date}} — {{parking_no}}')).toEqual({ ok: true });
    expect(checkBody('{{company.name}}')).toEqual({ ok: true });
  });

  it('rejects broken placeholders', () => {
    expect(checkBody('Dear {{tenant.name')).toMatchObject({ ok: false, code: 'templates.badPlaceholder' });
    expect(checkBody('Dear tenant.name}}')).toMatchObject({ ok: false, code: 'templates.badPlaceholder' });
    expect(checkBody('{{a.b.c}}')).toMatchObject({ ok: false, detail: '{{a.b.c}}' });
    expect(checkBody('{{rent | upper}}')).toMatchObject({ ok: false });
    expect(checkBody('{{<script>}}')).toMatchObject({ ok: false });
    expect(checkBody('{{}}')).toMatchObject({ ok: false });
    expect(checkBody('x'.repeat(20_001))).toMatchObject({ ok: false, code: 'validation.tooLong' });
  });

  it('lists the fields a body uses', () => {
    expect(placeholders('{{name}} {{ overdue | money }} {{tenant.phone}}')).toEqual(['name', 'overdue', 'tenant.phone']);
  });

  it('cleans signature lines', () => {
    expect(checkSignatures(undefined)).toEqual({ ok: true, value: [] });
    expect(checkSignatures([{ labelAr: 'المؤجر', labelEn: '' }, { labelAr: '', labelEn: '' }])).toEqual({ ok: true, value: [{ labelAr: 'المؤجر', labelEn: 'المؤجر' }] });
    expect(checkSignatures([{}, {}, {}, {}, {}])).toMatchObject({ ok: false });
    expect(checkSignatures('x')).toMatchObject({ ok: false });
  });
});
