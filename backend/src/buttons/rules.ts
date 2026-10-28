// Buttons (الأزرار) — pure rules, unit-tested. The same helpers exist in the app (services/buttons.js).

/** The actions library: what a button added by the platform team can do. */
export const ACTIONS = ['LINK', 'WHATSAPP', 'CALL', 'EMAIL', 'SET_FIELD', 'NEW_RECORD'] as const;
export type Action = (typeof ACTIONS)[number];

/** Records that have a record page where added buttons appear (plus every top-level section "cs:<key>"). */
export const BUTTON_ENTITIES = ['property', 'owner', 'tenant', 'lease'] as const;

/** Built-in button ids look like "tenants.add" or "leases.detail.renew". */
export const OVERRIDE_KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+){1,3}$/;

/** A field of the record: "phone", "tenant.phone", or an extra field key. */
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const FIELD_KEY = /^[a-z0-9_]{1,40}$/;

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; field: string };

const fail = (code: string, field: string): { ok: false; code: string; field: string } => ({ ok: false, code, field });

function text(src: Record<string, unknown>, key: string, max: number, required: boolean): Result<string | undefined> {
  const raw = src[key];
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return required ? fail('validation.required', key) : { ok: true, value: undefined };
  }
  if (typeof raw !== 'string') return fail('validation.invalid', key);
  if (raw.trim().length > max) return fail('validation.tooLong', key);
  return { ok: true, value: raw.trim() };
}

function path(src: Record<string, unknown>, key: string): Result<string> {
  const r = text(src, key, 80, true);
  if (!r.ok) return r;
  return FIELD_PATH.test(r.value as string) ? { ok: true, value: r.value as string } : fail('validation.invalid', key);
}

/**
 * Check and normalize the settings of an action. Checks that need the database
 * (the extra field exists, the target section exists) are done by the service.
 */
export function checkConfig(action: Action, input: unknown): Result<Record<string, unknown>> {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  switch (action) {
    case 'LINK': {
      const url = text(src, 'url', 500, true);
      if (!url.ok) return url;
      if (!/^https?:\/\//i.test(url.value as string)) return fail('buttons.badUrl', 'url');
      return { ok: true, value: { url: url.value } };
    }
    case 'WHATSAPP':
    case 'CALL': {
      const phoneField = path(src, 'phoneField');
      if (!phoneField.ok) return phoneField;
      if (action === 'CALL') return { ok: true, value: { phoneField: phoneField.value } };
      const message = text(src, 'message', 1000, false);
      if (!message.ok) return message;
      return { ok: true, value: { phoneField: phoneField.value, message: message.value ?? '' } };
    }
    case 'EMAIL': {
      const emailField = path(src, 'emailField');
      if (!emailField.ok) return emailField;
      const subject = text(src, 'subject', 200, false);
      if (!subject.ok) return subject;
      const body = text(src, 'body', 2000, false);
      if (!body.ok) return body;
      return { ok: true, value: { emailField: emailField.value, subject: subject.value ?? '', body: body.value ?? '' } };
    }
    case 'SET_FIELD': {
      const field = text(src, 'field', 40, true);
      if (!field.ok) return field;
      if (!FIELD_KEY.test(field.value as string)) return fail('validation.invalid', 'field');
      if (!('value' in src)) return fail('validation.required', 'value');
      return { ok: true, value: { field: field.value, value: src.value ?? null, confirm: src.confirm === true } };
    }
    case 'NEW_RECORD': {
      const section = text(src, 'section', 60, true);
      if (!section.ok) return section;
      const raw = Array.isArray(src.copy) ? src.copy : [];
      if (raw.length > 20) return fail('validation.invalid', 'copy');
      const copy: { from: string; to: string }[] = [];
      for (const item of raw) {
        const pair = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const from = path(pair, 'from');
        if (!from.ok) return fail(from.code, 'copy');
        if (typeof pair.to !== 'string' || !FIELD_KEY.test(pair.to)) return fail('validation.invalid', 'copy');
        copy.push({ from: from.value, to: pair.to });
      }
      return { ok: true, value: { section: section.value, copy } };
    }
    default:
      return fail('validation.invalid', 'action');
  }
}

/** Value of "phone", "tenant.phone" or an extra field "parking_no" on a record. */
export function readPath(record: unknown, fieldPath: string): unknown {
  if (!record || typeof record !== 'object') return undefined;
  const obj = record as Record<string, unknown>;
  let value: unknown = obj;
  for (const part of fieldPath.split('.')) {
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
  }
  if (value === undefined && obj.custom && typeof obj.custom === 'object') value = (obj.custom as Record<string, unknown>)[fieldPath];
  return value;
}

function display(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === 'object') return '';
  return String(value);
}

/** Replace {{field}} with the record's values (encoded for URLs when `encode` is given). */
export function fillTemplate(template: string, record: unknown, encode?: (s: string) => string): string {
  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g, (_m, key: string) => {
    const value = display(readPath(record, key));
    return encode ? encode(value) : value;
  });
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** WhatsApp number: digits only, "00" removed, 8-digit Omani numbers get 968. Null when not a phone. */
export function waPhone(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  let digits = String(raw)
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `968${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}
