import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager, Platform } from 'react-native';
import en from './en';
import ar from './ar';
import storage from '../services/storage';

// Switching language is instant on every platform — no app restart:
//  - phone & tablet: native auto-RTL is turned OFF (no double flipping on Arabic devices) and the
//    layout helpers below (row / start / end) flip the layout themselves;
//  - web: the page itself turns right-to-left (<html dir="rtl">), so the browser flips every row,
//    margin and alignment — there the helpers stay "row" / "flex-start" (flipping them too would
//    flip the layout back to left-to-right, which is what kept the web sidebar on the left).
const IS_WEB = Platform.OS === 'web';
if (!IS_WEB) {
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
  const flip = isRTL && !IS_WEB; // the app flips the layout itself only where the platform does not

  useEffect(() => {
    if (IS_WEB && typeof document !== 'undefined') {
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
      // Layout helpers — use these instead of hard-coded 'row' / 'row-reverse' / 'flex-end' / 'left'.
      row: flip ? 'row-reverse' : 'row',
      align: isRTL ? 'right' : 'left',
      start: flip ? 'flex-end' : 'flex-start',
      end: flip ? 'flex-start' : 'flex-end',
      // Chevron/arrow icons that point "forward" in reading direction
      forwardIcon: isRTL ? 'chevron-left' : 'chevron-right',
    }),
    [lang, setLang, isRTL, flip],
  );

  if (!ready) return null;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
