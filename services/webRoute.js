import { Platform } from 'react-native';

// Web: every page has its own address (/tenants, /leases?leaseId=…), so refreshing the page keeps it and the
// browser's Back / Forward buttons move between pages. Phone and tablet do not use addresses.
// The host must send every path to index.html (see docs/DEPLOY.md, public/_redirects).

export const URL_ROUTING = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.history;

/** Pages shown before signing in. */
export const PUBLIC_PAGES = ['', 'login', 'register', 'admin'];

/** { key, params } of the current address. Params are text (e.g. { leaseId: '…', analytics: 'true' }). */
export function readLocation() {
  if (!URL_ROUTING) return { key: null, params: null };
  const key = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
  const params = Object.fromEntries(new URLSearchParams(window.location.search));
  return { key: decodeURIComponent(key), params: Object.keys(params).length ? params : null };
}

/** Address of a page. Only simple values go into the address (a prefilled form stays in memory). */
export function hrefOf(key, params) {
  const simple = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && typeof v !== 'object');
  const qs = new URLSearchParams(simple.map(([k, v]) => [k, String(v)])).toString();
  return `/${key ?? ''}${qs ? `?${qs}` : ''}`;
}

/** Show a page's address: push = a new step for the Back button, replace = correct the current one. */
export function writeLocation(key, params, { replace = false } = {}) {
  if (!URL_ROUTING) return;
  const href = hrefOf(key, params);
  if (href === `${window.location.pathname}${window.location.search}`) return;
  window.history[replace ? 'replaceState' : 'pushState']({ key }, '', href);
}

/** Back / Forward in the browser. Returns the unsubscribe function. */
export function onLocationChange(fn) {
  if (!URL_ROUTING) return () => {};
  const handler = () => fn(readLocation());
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}
