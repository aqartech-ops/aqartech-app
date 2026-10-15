import { API_URL } from './config';

// Single place that talks to the AqarTech API.
// Errors are thrown as ApiError with `code` = an i18n key (e.g. "auth.wrongCredentials")
// so screens can show t(`errors.${code}`).

export class ApiError extends Error {
  constructor(code, status, field, extra) {
    super(code);
    this.code = code;
    this.status = status;
    this.field = field;
    this.extra = extra;
  }
}

let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token;
}

/** Called when the server rejects our token (session ended) — the session signs out. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function request(path, { method = 'GET', body, query } = {}) {
  let url = `${API_URL}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network', 0);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    // Nest error shape: { message, statusCode } or { message, field, ... }
    const message = data && typeof data === 'object' ? data.message : null;
    const code = typeof message === 'string' ? message : Array.isArray(message) ? message[0] : 'generic';
    if (response.status === 401 && authToken && onUnauthorized) onUnauthorized();
    throw new ApiError(code, response.status, data?.field, data);
  }
  return data;
}

export const api = {
  get: (path, query) => request(path, { query }),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body ?? {} }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

// ---- Endpoints ----
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  adminLogin: (email, password) => api.post('/admin/auth/login', { email, password }),
  register: (payload) => api.post('/auth/register', payload),
  me: () => api.get('/auth/me'),
};

export const plansApi = {
  list: () => api.get('/plans'),
  usage: () => api.get('/plans/usage'),
};

export const companyApi = {
  me: () => api.get('/company/me'),
  update: (data) => api.patch('/company/me', data),
};

export const usersApi = {
  list: (trash = false) => api.get('/users', { trash: trash ? '1' : undefined }),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.patch(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
  restore: (id) => api.post(`/users/${id}/restore`),
};

export const rolesApi = {
  list: () => api.get('/roles'),
  create: (data) => api.post('/roles', data),
  update: (id, data) => api.patch(`/roles/${id}`, data),
  remove: (id) => api.delete(`/roles/${id}`),
};

export const searchApi = {
  run: (q) => api.get('/search', { q }),
};

export const adminApi = {
  companies: () => api.get('/admin/companies'),
  updateSubscription: (companyId, data) => api.patch(`/admin/companies/${companyId}/subscription`, data),
  plans: () => api.get('/admin/plans'),
};
