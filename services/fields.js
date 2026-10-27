import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { errorText } from '../components/ui';
import { api } from './api';
import { formatOMR, parseOMR } from './money';

// Configurable fields (الحقول): rules for built-in fields and the extra fields defined by the platform team.
// Loaded once per session (refreshed every minute) — GET /fields.

const TTL = 60_000;
let cache = null;
let loadedAt = 0;
let pending = null;
const listeners = new Set();

export async function loadFields(force = false) {
  if (!force && cache && Date.now() - loadedAt < TTL) return cache;
  if (!pending) {
    pending = api
      .get('/fields')
      .then((cfg) => {
        cache = cfg;
        loadedAt = Date.now();
        listeners.forEach((fn) => fn(cfg));
        return cfg;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function clearFields() {
  cache = null;
  loadedAt = 0;
}

/**
 * For one form: `props(key, defaultLabel)` gives the props to spread on a built-in field
 * (renamed label with * when required, hidden, and the server error for that field);
 * `custom` lists the extra fields to draw with <CustomFields />.
 */
export function useFieldRules(entity, error) {
  const { t, lang } = useI18n();
  const [cfg, setCfg] = useState(cache);
  useEffect(() => {
    listeners.add(setCfg);
    loadFields().then(setCfg).catch(() => {});
    return () => listeners.delete(setCfg);
  }, []);
  return useMemo(() => {
    const part = cfg?.[entity] ?? { core: {}, custom: [] };
    return {
      custom: part.custom,
      required: (key) => !!part.core[key]?.required,
      props(key, defaultLabel) {
        const rule = part.core[key] ?? {};
        const renamed = lang === 'ar' ? rule.labelAr : rule.labelEn;
        const out = { label: `${renamed || defaultLabel}${rule.required ? ' *' : ''}`, hidden: !!rule.hidden };
        if (error?.field === key) out.error = errorText(t, error);
        return out;
      },
    };
  }, [cfg, entity, error, lang, t]);
}

export const fieldLabel = (def, lang) => (lang === 'ar' ? def.labelAr : def.labelEn) || def.key;
export const optionLabel = (opt, lang) => (lang === 'ar' ? opt.labelAr : opt.labelEn) || opt.value;

/** Saved values → what the inputs edit (money as "12.500", numbers as text). */
export function toEditable(defs, saved) {
  const out = {};
  for (const d of defs ?? []) {
    const v = saved?.[d.key];
    if (v === undefined || v === null) continue;
    if (d.type === 'MONEY') out[d.key] = formatOMR(v, 'en', { withCurrency: false }).replace(/,/g, '');
    else if (d.type === 'NUMBER') out[d.key] = String(v);
    else out[d.key] = v;
  }
  return out;
}

/** Edited values → what the server expects (money in baisa, numbers as numbers, empty → null). */
export function toPayload(defs, values) {
  const out = {};
  for (const d of defs ?? []) {
    if (!values || !Object.prototype.hasOwnProperty.call(values, d.key)) continue;
    const v = values[d.key];
    if (v === '' || v === undefined) out[d.key] = null;
    else if (d.type === 'MONEY') out[d.key] = parseOMR(v) ?? v; // invalid text is sent as-is so the server names the field
    else if (d.type === 'NUMBER') out[d.key] = Number.isFinite(Number(v)) ? Number(v) : v;
    else out[d.key] = v;
  }
  return out;
}
