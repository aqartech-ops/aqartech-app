import { useEffect, useState } from 'react';
import { api } from './api';

// Sections created by the platform team (الأقسام المضافة): definitions shared by menus, forms and roles.
// Loaded once per session and refreshed every minute — GET /custom/sections.

const TTL = 60_000;
let cache = null;
let loadedAt = 0;
let pending = null;
const listeners = new Set();

export async function loadCustomSections(force = false) {
  if (!force && cache && Date.now() - loadedAt < TTL) return cache;
  if (!pending) {
    pending = api
      .get('/custom/sections')
      .then((list) => {
        cache = list;
        loadedAt = Date.now();
        listeners.forEach((fn) => fn(list));
        return list;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function clearCustomSections() {
  cache = null;
  loadedAt = 0;
}

/** All active custom sections (top-level and sub-sections). `enabled` = false skips loading (e.g. signed out). */
export function useCustomSections(enabled = true) {
  const [list, setList] = useState(cache ?? []);
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setList);
    loadCustomSections().then(setList).catch(() => {});
    return () => listeners.delete(setList);
  }, [enabled]);
  return list;
}

export const sectionName = (s, lang) => (s ? (lang === 'ar' ? s.nameAr : s.nameEn) : '');

/** Menu/permission key of a top-level custom section. */
export const accessKey = (s) => `cs_${s.key}`;

export const customApi = {
  list: (key, query) => api.get(`/custom/${key}/records`, query),
  get: (key, id) => api.get(`/custom/${key}/records/${id}`),
  create: (key, data) => api.post(`/custom/${key}/records`, data),
  update: (key, id, data) => api.patch(`/custom/${key}/records/${id}`, data),
  remove: (key, id) => api.delete(`/custom/${key}/records/${id}`),
  restore: (key, id) => api.post(`/custom/${key}/records/${id}/restore`),
};
