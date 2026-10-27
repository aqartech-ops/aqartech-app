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
  forgotPassword: (email, locale) => api.post('/auth/forgot-password', { email, locale }),
  resetPassword: (email, code, password) => api.post('/auth/reset-password', { email, code, password }),
  changePassword: (currentPassword, password) => api.post('/auth/change-password', { currentPassword, password }),
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

export const dashboardApi = {
  get: () => api.get('/dashboard'),
};

export const propertiesApi = {
  list: (trash = false) => api.get('/properties', { trash: trash ? '1' : undefined }),
  get: (id) => api.get(`/properties/${id}`),
  create: (data) => api.post('/properties', data),
  update: (id, data) => api.patch(`/properties/${id}`, data),
  remove: (id) => api.delete(`/properties/${id}`),
  restore: (id) => api.post(`/properties/${id}/restore`),
  units: (id, trash = false) => api.get(`/properties/${id}/units`, { trash: trash ? '1' : undefined }),
  createUnit: (id, data) => api.post(`/properties/${id}/units`, data),
  createUnitsBulk: (id, data) => api.post(`/properties/${id}/units/bulk`, data),
  updateUnit: (unitId, data) => api.patch(`/units/${unitId}`, data),
  removeUnit: (unitId) => api.delete(`/units/${unitId}`),
  restoreUnit: (unitId) => api.post(`/units/${unitId}/restore`),
};

export const ownersApi = {
  list: (trash = false) => api.get('/owners', { trash: trash ? '1' : undefined }),
  get: (id) => api.get(`/owners/${id}`),
  create: (data) => api.post('/owners', data),
  update: (id, data) => api.patch(`/owners/${id}`, data),
  remove: (id) => api.delete(`/owners/${id}`),
  restore: (id) => api.post(`/owners/${id}/restore`),
  agreements: (propertyId) => api.get(`/properties/${propertyId}/agreements`),
  saveAgreement: (propertyId, data) => request(`/properties/${propertyId}/agreement`, { method: 'PUT', body: data }),
  endAgreement: (propertyId, data) => api.post(`/properties/${propertyId}/agreement/end`, data),
  partners: (propertyId) => api.get(`/properties/${propertyId}/partners`),
  savePartners: (propertyId, partners) => request(`/properties/${propertyId}/partners`, { method: 'PUT', body: { partners } }),
};

export const tenantsApi = {
  list: (trash = false) => api.get('/tenants', { trash: trash ? '1' : undefined }),
  get: (id) => api.get(`/tenants/${id}`),
  create: (data) => api.post('/tenants', data),
  update: (id, data) => api.patch(`/tenants/${id}`, data),
  remove: (id) => api.delete(`/tenants/${id}`),
  restore: (id) => api.post(`/tenants/${id}/restore`),
};

export const leasesApi = {
  list: (query) => api.get('/leases', query),
  get: (id) => api.get(`/leases/${id}`),
  preview: (data) => api.post('/leases/preview', data),
  create: (data) => api.post('/leases', data),
  update: (id, data) => api.patch(`/leases/${id}`, data),
  activate: (id) => api.post(`/leases/${id}/activate`),
  terminate: (id, data) => api.post(`/leases/${id}/terminate`, data),
  renew: (id, data) => api.post(`/leases/${id}/renew`, data),
  remove: (id) => api.delete(`/leases/${id}`),
};

export const financeApi = {
  summary: () => api.get('/finance/summary'),
  receivables: (query) => api.get('/finance/receivables', query),
  balances: () => api.get('/finance/balances'),
  statement: (tenantId) => api.get(`/finance/tenants/${tenantId}/statement`),
  journal: (page = 1) => api.get('/finance/journal', { page }),
  trialBalance: () => api.get('/finance/trial-balance'),
};

export const searchApi = {
  run: (q) => api.get('/search', { q }),
};

export const adminApi = {
  companies: () => api.get('/admin/companies'),
  updateSubscription: (companyId, data) => api.patch(`/admin/companies/${companyId}/subscription`, data),
  plans: () => api.get('/admin/plans'),
  planOptions: () => api.get('/admin/plan-options'),
  createPlan: (data) => api.post('/admin/plans', data),
  updatePlan: (id, data) => api.patch(`/admin/plans/${id}`, data),
  removePlan: (id) => api.delete(`/admin/plans/${id}`),
};
