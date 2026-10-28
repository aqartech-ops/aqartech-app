import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

// Buttons (الأزرار), set by the platform team for every subscriber — GET /buttons:
//  - `overrides`: built-in buttons renamed / re-iconed / hidden, by button id (e.g. "tenants.add");
//  - `custom`: buttons added on record pages from the actions library.
// Every action button of the app passes its `id` to <Button>/<IconButton>; the catalog below lists them all
// for the platform team's "Buttons" page (run `node scripts/check-buttons.mjs` to verify none is missing).

const TTL = 60_000;
let state = { overrides: {}, custom: [] };
let loadedAt = 0;
let pending = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => state;

export async function loadButtons(force = false) {
  if (!force && loadedAt && Date.now() - loadedAt < TTL) return state;
  if (!pending) {
    pending = api
      .get('/buttons')
      .then((cfg) => {
        state = { overrides: cfg?.overrides ?? {}, custom: cfg?.custom ?? [] };
        loadedAt = Date.now();
        emit();
        return state;
      })
      .catch(() => state)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function clearButtons() {
  state = { overrides: {}, custom: [] };
  loadedAt = 0;
  emit();
}

/** Everything (for the record pages' added buttons). */
export function useButtonsConfig() {
  const cfg = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    loadButtons().catch(() => {});
  }, []);
  return cfg;
}

/** The platform team's settings for one built-in button (undefined = as designed). */
export function useButtonOverride(id) {
  const cfg = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (id) loadButtons().catch(() => {});
  }, [id]);
  return id ? cfg.overrides[id] : undefined;
}

// ------------------------------------------------------------------ catalog of built-in buttons

/**
 * Every action button of the subscriber screens: [id, default label i18n key, default icon, options].
 * `rename: false` = its text is data (a phone number, a month…), so it can be hidden or re-iconed but not renamed.
 * Save / Cancel / Back in forms, choice chips and "Load more" are not listed: they are part of the forms themselves.
 */
const FIXED_TEXT = { rename: false };
export const BUTTON_GROUPS = [
  ['dashboard', [
    ['dashboard.newTenant', 'dashboard.newTenant', 'account-plus-outline'],
    ['dashboard.addProperty', 'properties.add', 'home-plus-outline'],
    ['dashboard.newWorkOrder', 'maintenance.add', 'wrench-outline'],
  ]],
  ['properties', [
    ['properties.add', 'properties.add', 'plus'],
    ['properties.edit', 'common.edit', 'pencil-outline'],
    ['properties.delete', 'common.delete', 'delete-outline'],
    ['properties.trash', 'common.trash', 'delete-restore'],
    ['properties.restore', 'common.restore', 'restore'],
    ['agreement.manage', 'agreement.edit', 'pencil-outline', FIXED_TEXT],
    ['agreement.end', 'agreement.end', null],
    ['partners.edit', 'partners.edit', 'pencil-outline'],
  ]],
  ['units', [
    ['units.add', 'units.add', 'plus'],
    ['units.addBulk', 'units.addBulk', 'format-list-numbered'],
    ['units.delete', 'common.delete', 'delete-outline'],
    ['units.trash', 'common.trash', 'delete-restore'],
    ['units.restore', 'common.restore', 'restore'],
  ]],
  ['tenants', [
    ['tenants.add', 'tenants.add', 'account-plus-outline'],
    ['tenants.edit', 'common.edit', 'pencil-outline'],
    ['tenants.delete', 'common.delete', 'delete-outline'],
    ['tenants.trash', 'common.trash', 'delete-restore'],
    ['tenants.restore', 'common.restore', 'restore'],
    ['tenants.statement', 'finance.statement', 'file-document-outline'],
    ['tenants.call', 'buttons.call', 'phone-outline', FIXED_TEXT],
    ['tenants.whatsapp', 'buttons.whatsapp', 'whatsapp'],
  ]],
  ['leases', [
    ['leases.add', 'leases.add', 'file-sign'],
    ['leases.saveDraft', 'leases.saveDraft', null],
    ['leases.activate', 'leases.activate', 'check-decagram-outline'],
    ['leases.edit', 'common.edit', 'pencil-outline'],
    ['leases.renew', 'leases.renew', 'autorenew'],
    ['leases.terminate', 'leases.terminate', 'file-cancel-outline'],
    ['leases.delete', 'common.delete', 'delete-outline'],
    ['leases.newTenant', 'leases.newTenant', 'account-plus-outline'],
  ]],
  ['owners', [
    ['owners.add', 'owners.add', 'plus'],
    ['owners.edit', 'common.edit', 'pencil-outline'],
    ['owners.delete', 'common.delete', 'delete-outline'],
    ['owners.trash', 'common.trash', 'delete-restore'],
    ['owners.restore', 'common.restore', 'restore'],
    ['owners.account', 'ownerStatements.account', 'file-document-outline'],
    ['owners.call', 'buttons.call', 'phone-outline', FIXED_TEXT],
    ['owners.whatsapp', 'buttons.whatsapp', 'whatsapp'],
    ['owners.linkProperty', 'owners.linkProperty', 'link-variant-plus'],
    ['owners.newProperty', 'owners.newPropertyForOwner', 'home-plus-outline'],
  ]],
  ['payments', [
    ['payments.add', 'payments.add', 'cash-plus'],
    ['payments.collect', 'payments.collect', 'cash-plus'],
    ['payments.print', 'receipt.print', 'printer-outline'],
    ['payments.share', 'receipt.share', 'share-variant-outline'],
    ['payments.void', 'payments.void', 'cancel'],
  ]],
  ['cheques', [
    ['cheques.add', 'cheques.add', 'plus'],
    ['cheques.bulk', 'cheques.bulk', 'checkbook'],
    ['cheques.deposit', 'cheques.deposit', 'bank-transfer-in'],
    ['cheques.clear', 'cheques.clear', 'check-circle-outline'],
    ['cheques.bounce', 'cheques.bounce', 'alert-circle-outline'],
    ['cheques.cancel', 'cheques.cancel', 'undo-variant'],
  ]],
  ['expenses', [
    ['expenses.add', 'expenses.add', 'cash-minus'],
    ['expenses.void', 'expenses.void', 'cancel'],
    ['expenses.categories', 'expenses.categories', 'format-list-bulleted'],
    ['expenses.addCategory', 'expenses.addCategory', 'plus'],
    ['expenses.editCategory', 'common.edit', 'pencil-outline'],
  ]],
  ['ownerStatements', [
    ['ownerStatements.new', 'ownerStatements.new', 'file-document-edit-outline'],
    ['ownerStatements.issue', 'ownerStatements.issue', 'check'],
    ['ownerStatements.print', 'receipt.print', 'printer-outline'],
    ['ownerStatements.share', 'receipt.share', 'share-variant-outline'],
    ['ownerStatements.void', 'ownerStatements.void', 'cancel'],
    ['ownerStatements.payout', 'ownerStatements.payout', 'bank-transfer-out'],
  ]],
  ['reports', [
    ['reports.print', 'receipt.print', 'printer-outline'],
    ['reports.share', 'receipt.share', 'share-variant-outline'],
    ['export.excel', 'export.excel', 'microsoft-excel'],
  ]],
  ['closing', [
    ['closing.closeMonth', 'closing.closeMonth', 'lock-outline', FIXED_TEXT],
    ['closing.reopen', 'closing.reopen', 'lock-open-outline', FIXED_TEXT],
    ['municipality.register', 'municipality.register', 'file-certificate-outline', FIXED_TEXT],
  ]],
  ['maintenance', [
    ['maintenance.add', 'maintenance.add', 'wrench-outline'],
    ['maintenance.start', 'maintenance.start', 'play'],
    ['maintenance.complete', 'maintenance.complete', 'check'],
    ['maintenance.edit', 'common.edit', 'pencil-outline'],
    ['maintenance.cancel', 'maintenance.cancel', 'close'],
    ['maintenance.callVendor', 'buttons.call', 'phone-outline', FIXED_TEXT],
  ]],
  ['vendors', [
    ['vendors.add', 'maintenance.addVendor', 'account-hard-hat'],
    ['vendors.edit', 'common.edit', 'pencil-outline'],
    ['vendors.delete', 'common.delete', 'delete-outline'],
    ['vendors.call', 'buttons.call', 'phone-outline', FIXED_TEXT],
  ]],
  ['records', [
    ['records.add', 'sectionsUser.add', 'plus'],
    ['records.edit', 'common.edit', 'pencil-outline'],
    ['records.delete', 'common.delete', 'delete-outline'],
    ['records.trash', 'common.trash', 'delete-restore'],
    ['records.restore', 'common.restore', 'restore'],
    ['records.addSub', 'sectionsUser.add', 'plus'],
    ['records.deleteSub', 'common.delete', 'delete-outline'],
  ]],
  ['users', [
    ['users.add', 'users.addUser', 'account-plus-outline'],
    ['users.edit', 'common.edit', 'pencil-outline'],
    ['users.delete', 'common.delete', 'delete-outline'],
    ['users.toggleActive', 'users.deactivate', 'account-cancel-outline', FIXED_TEXT],
    ['users.trash', 'common.trash', 'delete-restore'],
    ['users.restore', 'common.restore', 'restore'],
    ['roles.add', 'users.addRole', 'shield-plus-outline'],
    ['roles.edit', 'common.edit', 'pencil-outline'],
    ['roles.delete', 'common.delete', 'delete-outline'],
  ]],
].map(([group, buttons]) => ({
  group,
  buttons: buttons.map(([id, labelKey, icon, opts]) => ({ id, labelKey, icon, rename: opts?.rename !== false })),
}));

export const BUTTON_IDS = BUTTON_GROUPS.flatMap((g) => g.buttons.map((b) => b.id));

// ------------------------------------------------------------------ actions library (same rules as backend/src/buttons/rules.ts)

export const ACTIONS = ['LINK', 'WHATSAPP', 'CALL', 'EMAIL', 'SET_FIELD', 'NEW_RECORD'];
/** Actions that change data need the "Edit" permission on the section; the others only "View". */
export const EDIT_ACTIONS = ['SET_FIELD', 'NEW_RECORD'];
export const ACTION_ICONS = { LINK: 'open-in-new', WHATSAPP: 'whatsapp', CALL: 'phone-outline', EMAIL: 'email-outline', SET_FIELD: 'check-circle-outline', NEW_RECORD: 'plus-box-outline' };

/** Record pages where added buttons appear, and the role section each one belongs to. */
export const BUTTON_ENTITIES = ['tenant', 'lease', 'owner', 'property'];
export const ENTITY_SECTION = { tenant: 'tenants', lease: 'tenants', owner: 'owners', property: 'properties' };

/** Fields usable in texts ({{name}}) and as phone/email source, per record page. Extra fields are added from /fields. */
export const RECORD_FIELDS = {
  tenant: [['name', 'tenants.name'], ['phone', 'tenants.phone'], ['phone2', 'tenants.phone2'], ['email', 'tenants.email'], ['civilId', 'tenants.civilId'], ['guarantorPhone', 'tenants.guarantorPhone']],
  owner: [['name', 'owners.name'], ['phone', 'owners.phone'], ['email', 'owners.email'], ['civilId', 'owners.civilId']],
  property: [['name', 'properties.name'], ['governorate', 'properties.governorate'], ['wilayat', 'properties.wilayat'], ['address', 'properties.address'], ['plotNumber', 'properties.plotNumber']],
  lease: [['number', 'buttons.leaseNumber'], ['startDate', 'leases.startDate'], ['endDate', 'leases.endDate'], ['tenant.name', 'buttons.tenantName'], ['tenant.phone', 'buttons.tenantPhone'], ['unit.number', 'buttons.unitNumber'], ['property.name', 'buttons.propertyName']],
};

/** Value of "phone", "tenant.phone" or an extra field "parking_no" on a record. */
export function readPath(record, path) {
  if (!record || typeof record !== 'object') return undefined;
  let value = record;
  for (const part of path.split('.')) value = value && typeof value === 'object' ? value[part] : undefined;
  if (value === undefined && record.custom && typeof record.custom === 'object') value = record.custom[path];
  return value;
}

function display(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === 'object') return '';
  return String(value);
}

/** Replace {{field}} with the record's values (encoded for URLs when `encode` is given). */
export function fillTemplate(template, record, encode) {
  return String(template ?? '').replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g, (_m, key) => {
    const value = display(readPath(record, key));
    return encode ? encode(value) : value;
  });
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** WhatsApp number: digits only, "00" removed, 8-digit Omani numbers get 968. Null when not a phone. */
export function waPhone(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  let digits = String(raw)
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `968${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** wa.me link for a phone (with an optional message), or null. */
export function whatsappUrl(phone, message) {
  const n = waPhone(phone);
  if (!n) return null;
  return message ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : `https://wa.me/${n}`;
}
