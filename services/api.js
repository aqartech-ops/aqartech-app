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
  journal: (page = 1, all = false) => api.get('/finance/journal', all ? { all: '1' } : { page }),
  trialBalance: () => api.get('/finance/trial-balance'),
  tenantLeases: (tenantId) => api.get(`/finance/tenants/${tenantId}/leases`),
  payments: (query) => api.get('/finance/payments', query),
  payment: (id) => api.get(`/finance/payments/${id}`),
  createPayment: (data) => api.post('/finance/payments', data),
  voidPayment: (id, reason) => api.post(`/finance/payments/${id}/void`, { reason }),
  cheques: (query) => api.get('/finance/cheques', query),
  chequeStats: () => api.get('/finance/cheques/stats'),
  chequePlan: (leaseId) => api.get(`/finance/leases/${leaseId}/cheque-plan`),
  createCheque: (data) => api.post('/finance/cheques', data),
  bulkCheques: (data) => api.post('/finance/cheques/bulk', data),
  updateCheque: (id, data) => api.patch(`/finance/cheques/${id}`, data),
  depositCheque: (id, date) => api.post(`/finance/cheques/${id}/deposit`, { date }),
  clearCheque: (id, date) => api.post(`/finance/cheques/${id}/clear`, { date }),
  bounceCheque: (id, data) => api.post(`/finance/cheques/${id}/bounce`, data),
  cancelCheque: (id, reason) => api.post(`/finance/cheques/${id}/cancel`, { reason }),
  expenses: (query) => api.get('/finance/expenses', query),
  expense: (id) => api.get(`/finance/expenses/${id}`),
  createExpense: (data) => api.post('/finance/expenses', data),
  voidExpense: (id, reason) => api.post(`/finance/expenses/${id}/void`, { reason }),
  categories: (all = false) => api.get('/finance/expense-categories', all ? { all: 1 } : undefined),
  createCategory: (data) => api.post('/finance/expense-categories', data),
  updateCategory: (id, data) => api.patch(`/finance/expense-categories/${id}`, data),
  vendors: () => api.get('/finance/vendors'),
  managedProperties: () => api.get('/finance/owner-statements/properties'),
  previewStatement: (query) => api.get('/finance/owner-statements/preview', query),
  statements: (query) => api.get('/finance/owner-statements', query),
  statement: (id) => api.get(`/finance/owner-statements/${id}`),
  issueStatement: (data) => api.post('/finance/owner-statements', data),
  voidStatement: (id, reason) => api.post(`/finance/owner-statements/${id}/void`, { reason }),
  ownerBalances: () => api.get('/finance/owners/balances'),
  ownerAccount: (ownerId) => api.get(`/finance/owners/${ownerId}/account`),
  createPayout: (data) => api.post('/finance/owner-payouts', data),
  voidPayout: (id, reason) => api.post(`/finance/owner-payouts/${id}/void`, { reason }),
  incomeReport: (query) => api.get('/finance/reports/income', query),
  propertiesReport: (year) => api.get('/finance/reports/properties', { year }),
  closing: () => api.get('/finance/closing'),
  closeMonth: (month) => api.post('/finance/closing', { month }),
  reopenMonth: (reason) => api.post('/finance/closing/reopen', { reason }),
  municipality: (filter) => api.get('/finance/municipality', { filter }),
  registerMunicipality: (data) => api.post('/finance/municipality', data),
};

export const maintenanceApi = {
  list: (query) => api.get('/maintenance/work-orders', query),
  stats: () => api.get('/maintenance/work-orders/stats'),
  get: (id) => api.get(`/maintenance/work-orders/${id}`),
  create: (data) => api.post('/maintenance/work-orders', data),
  update: (id, data) => api.patch(`/maintenance/work-orders/${id}`, data),
  start: (id) => api.post(`/maintenance/work-orders/${id}/start`),
  complete: (id, data) => api.post(`/maintenance/work-orders/${id}/complete`, data),
  cancel: (id, reason) => api.post(`/maintenance/work-orders/${id}/cancel`, { reason }),
  vendors: () => api.get('/maintenance/vendors'),
  createVendor: (data) => api.post('/maintenance/vendors', data),
  updateVendor: (id, data) => api.patch(`/maintenance/vendors/${id}`, data),
  removeVendor: (id) => api.delete(`/maintenance/vendors/${id}`),
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
  fields: (entity) => api.get('/admin/fields', { entity }),
  setCoreField: (entity, key, data) => api.patch(`/admin/fields/core/${entity}/${key}`, data),
  createField: (data) => api.post('/admin/fields', data),
  updateField: (id, data) => api.patch(`/admin/fields/${id}`, data),
  moveField: (id, direction) => api.post(`/admin/fields/${id}/move`, { direction }),
  removeField: (id, purge = false) => api.delete(`/admin/fields/${id}${purge ? '?purge=1' : ''}`),
  sections: () => api.get('/admin/custom-sections'),
  createSection: (data) => api.post('/admin/custom-sections', data),
  updateSection: (id, data) => api.patch(`/admin/custom-sections/${id}`, data),
  moveSection: (id, direction) => api.post(`/admin/custom-sections/${id}/move`, { direction }),
  removeSection: (id, purge = false) => api.delete(`/admin/custom-sections/${id}${purge ? '?purge=1' : ''}`),
};
