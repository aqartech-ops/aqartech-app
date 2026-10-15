import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager, Platform } from 'react-native';
import en from './en';
import ar from './ar';
import storage from '../services/storage';

// We control layout direction ourselves (row / row-reverse, text alignment) so switching
// language is instant on phone, tablet and web — no app restart. Native auto-RTL is turned
// off to avoid double flipping on devices whose system language is Arabic.
if (Platform.OS !== 'web') {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
}

export const LANGUAGES = [
  { code: 'en', label: 'English', rtl: false },
  { code: 'ar', label: 'العربية', rtl: true },
];
const DICTIONARIES = { en, ar };
const DEFAULT_LANG = 'en';
const STORAGE_KEY = 'aqartech.lang';

function lookup(dict, key) {
  // keys like "errors.auth.required" may contain dots inside the last segment, so try the
  // longest existing path first.
  if (dict[key] !== undefined) return dict[key];
  const parts = key.split('.');
  let node = dict;
  for (let i = 0; i < parts.length; i += 1) {
    if (node && typeof node === 'object') {
      const rest = parts.slice(i).join('.');
      if (typeof node[rest] === 'string') return node[rest];
      node = node[parts[i]];
    } else {
      return undefined;
    }
  }
  return node;
}

export function translate(lang, key, vars) {
  let text = lookup(DICTIONARIES[lang], key);
  if (typeof text !== 'string') text = lookup(DICTIONARIES[DEFAULT_LANG], key);
  if (typeof text !== 'string') return key;
  if (vars) {
    text = text.replace(/\{\{(\w+)\}\}/g, (_, name) => (vars[name] !== undefined ? String(vars[name]) : ''));
  }
  return text;
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage.get(STORAGE_KEY).then((saved) => {
      if (saved && DICTIONARIES[saved]) setLangState(saved);
      setReady(true);
    });
  }, []);

  const isRTL = LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    }
  }, [lang, isRTL]);

  const setLang = useCallback((code) => {
    if (!DICTIONARIES[code]) return;
    setLangState(code);
    storage.set(STORAGE_KEY, code);
  }, []);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      isRTL,
      t: (key, vars) => translate(lang, key, vars),
      // Layout helpers — use these instead of hard-coded 'row' / 'left'.
      row: isRTL ? 'row-reverse' : 'row',
      align: isRTL ? 'right' : 'left',
      start: isRTL ? 'flex-end' : 'flex-start',
      // Chevron/arrow icons that point "forward" in reading direction
      forwardIcon: isRTL ? 'chevron-left' : 'chevron-right',
    }),
    [lang, setLang, isRTL],
  );

  if (!ready) return null;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
