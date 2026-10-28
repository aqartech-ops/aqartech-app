import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

// Print templates written by the platform team (active ones) — GET /print-templates. Refreshed every minute.

const TTL = 60_000;
let rows = [];
let loadedAt = 0;
let pending = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => rows;

export async function loadTemplates(force = false) {
  if (!force && loadedAt && Date.now() - loadedAt < TTL) return rows;
  if (!pending) {
    pending = api
      .get('/print-templates')
      .then((list) => {
        rows = Array.isArray(list) ? list : [];
        loadedAt = Date.now();
        emit();
        return rows;
      })
      .catch(() => rows)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function clearTemplates() {
  rows = [];
  loadedAt = 0;
  emit();
}

/** Active templates of one kind of record ('tenant', 'lease', 'owner', 'property', 'cs:<key>'). */
export function useTemplates(entity) {
  const all = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    loadTemplates().catch(() => {});
  }, []);
  return all.filter((r) => r.entity === entity);
}

/** Today in Oman as YYYY-MM-DD (dates on printed documents). */
export function omanToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
