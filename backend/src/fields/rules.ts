// Configurable fields (الحقول) — pure rules, unit-tested.

export const ENTITIES = ['property', 'unit', 'owner', 'tenant', 'lease', 'expense', 'workOrder', 'vendor'] as const;
export type Entity = (typeof ENTITIES)[number];

export const FIELD_TYPES = ['TEXT', 'LONGTEXT', 'NUMBER', 'MONEY', 'DATE', 'SELECT', 'MULTISELECT', 'BOOLEAN', 'PHONE', 'EMAIL'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * Built-in OPTIONAL fields the platform team may make required, hide or rename, per entity.
 * Fields that are always required (name, unit number, amounts…) are not listed: they cannot be changed.
 * `positive` = a number/money field where "required" means greater than zero.
 */
export type CoreField = { key: string; positive?: boolean; onlyForType?: 'INDIVIDUAL' | 'COMPANY' };

export const CORE_FIELDS: Record<Entity, CoreField[]> = {
  property: [{ key: 'governorate' }, { key: 'wilayat' }, { key: 'address' }, { key: 'plotNumber' }, { key: 'floors', positive: true }, { key: 'propertyValue', positive: true }, { key: 'investmentCost', positive: true }, { key: 'notes' }],
  unit: [{ key: 'floor' }, { key: 'area', positive: true }, { key: 'bedrooms', positive: true }, { key: 'bathrooms', positive: true }, { key: 'askingRent', positive: true }, { key: 'electricityMeter' }, { key: 'waterMeter' }, { key: 'notes' }],
  owner: [{ key: 'civilId', onlyForType: 'INDIVIDUAL' }, { key: 'crNumber', onlyForType: 'COMPANY' }, { key: 'nationality' }, { key: 'phone' }, { key: 'email' }, { key: 'bankName' }, { key: 'accountName' }, { key: 'accountNumber' }, { key: 'notes' }],
  tenant: [
    { key: 'civilId', onlyForType: 'INDIVIDUAL' },
    { key: 'idExpiry', onlyForType: 'INDIVIDUAL' },
    { key: 'crNumber', onlyForType: 'COMPANY' },
    { key: 'nationality' },
    { key: 'phone' },
    { key: 'phone2' },
    { key: 'email' },
    { key: 'employer', onlyForType: 'INDIVIDUAL' },
    { key: 'guarantorName' },
    { key: 'guarantorPhone' },
    { key: 'guarantorCivilId' },
    { key: 'notes' },
  ],
  lease: [{ key: 'deposit', positive: true }, { key: 'municipalityNo' }, { key: 'notes' }],
  expense: [{ key: 'vendorId' }, { key: 'invoiceNo' }],
  workOrder: [{ key: 'description' }, { key: 'vendorId' }, { key: 'estimatedCost', positive: true }, { key: 'scheduledDate' }, { key: 'reportedBy' }],
  vendor: [{ key: 'phone' }, { key: 'email' }, { key: 'specialty' }],
};

/** Does a built-in field apply to this record? (civil ID is for individuals, CR number for companies) */
export function coreApplies(field: CoreField, type: unknown): boolean {
  if (!field.onlyForType) return true;
  return (type === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL') === field.onlyForType;
}

export function isEntity(value: string): value is Entity {
  return (ENTITIES as readonly string[]).includes(value);
}

export function isCoreKey(entity: Entity, key: string) {
  return CORE_FIELDS[entity].some((f) => f.key === key);
}

/** "Parking No." → "parking_no"; keys are stable and never shown to users. */
export function slugKey(label: string): string {
  const base = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'field';
}

/** A real calendar day (rejects 2026-02-30). */
function validDay(text: string) {
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

export function isEmpty(value: unknown, positive = false): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return positive ? value <= 0 : false;
  return false;
}

export type FieldDef = { key: string; type: FieldType; required: boolean; options?: { value: string }[] };
export type Check = { ok: true; value: unknown } | { ok: false; code: string };

/** Validate and normalise one extra-field value. Empty → null (the caller decides if that is allowed). */
export function checkValue(def: FieldDef, raw: unknown): Check {
  if (isEmpty(raw)) return { ok: true, value: null };
  const opts = (def.options ?? []).map((o) => o.value);
  switch (def.type) {
    case 'TEXT':
    case 'PHONE':
      return typeof raw === 'string' && raw.trim().length <= (def.type === 'PHONE' ? 30 : 500) ? { ok: true, value: raw.trim() } : { ok: false, code: 'validation.tooLong' };
    case 'LONGTEXT':
      return typeof raw === 'string' && raw.length <= 5000 ? { ok: true, value: raw } : { ok: false, code: 'validation.tooLong' };
    case 'EMAIL':
      return typeof raw === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim()) ? { ok: true, value: raw.trim().toLowerCase() } : { ok: false, code: 'validation.email' };
    case 'NUMBER':
      return typeof raw === 'number' && Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, code: 'validation.invalid' };
    case 'MONEY':
      return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? { ok: true, value: raw } : { ok: false, code: 'validation.invalid' };
    case 'DATE':
      return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) && validDay(raw)
        ? { ok: true, value: raw }
        : { ok: false, code: 'validation.date' };
    case 'BOOLEAN':
      return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false, code: 'validation.invalid' };
    case 'SELECT':
      return typeof raw === 'string' && opts.includes(raw) ? { ok: true, value: raw } : { ok: false, code: 'validation.invalid' };
    case 'MULTISELECT':
      return Array.isArray(raw) && raw.every((x) => typeof x === 'string' && opts.includes(x)) ? { ok: true, value: [...new Set(raw)] } : { ok: false, code: 'validation.invalid' };
    default:
      return { ok: false, code: 'validation.invalid' };
  }
}

/**
 * Merge submitted extra-field values onto the saved ones.
 * - only active definitions are accepted (unknown keys are ignored; values of removed fields are kept);
 * - required fields must have a value after the merge.
 * Returns the new `custom` object, or an error with the field key.
 */
export function mergeCustom(
  defs: FieldDef[],
  saved: Record<string, unknown>,
  submitted: Record<string, unknown> | undefined,
  enforceRequired: boolean,
): { ok: true; custom: Record<string, unknown> } | { ok: false; code: string; field: string } {
  const custom: Record<string, unknown> = { ...saved };
  for (const def of defs) {
    if (submitted && Object.prototype.hasOwnProperty.call(submitted, def.key)) {
      const checked = checkValue(def, submitted[def.key]);
      if (!checked.ok) return { ok: false, code: checked.code, field: `custom.${def.key}` };
      if (checked.value === null) delete custom[def.key];
      else custom[def.key] = checked.value;
    }
    if (enforceRequired && def.required && isEmpty(custom[def.key])) return { ok: false, code: 'validation.required', field: `custom.${def.key}` };
  }
  return { ok: true, custom };
}
