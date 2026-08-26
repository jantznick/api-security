/**
 * Local dev: empty VITE_API_URL → Vite proxy `/api` → core.
 * Production (Render): set VITE_API_URL to the public core origin
 * (e.g. https://core-xxx.up.railway.app). We append `/api` unless
 * the value already ends with it.
 */
function resolveApiBase() {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  if (!raw) return '/api';
  const base = raw.replace(/\/$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

const API_BASE = resolveApiBase();

/** API failure with HTTP status (billing uses 404 / 503). */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    // Required for Render → Railway cross-origin session cookies.
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(error.error || 'Request failed', response.status);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const authAPI = {
  register: (email, password) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  requestMagicToken: (email, intent = 'login') =>
    request('/auth/magic-token/request', {
      method: 'POST',
      body: JSON.stringify({ email, intent }),
    }),
  loginWithMagicToken: (token) =>
    request('/auth/magic-token/login', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  updateMe: (body) =>
    request('/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
};

export const projectsAPI = {
  list: () => request('/projects'),
  /** Create a Service under personal Default (asService: true, default) or a grouping Project */
  create: (name, { asService = true } = {}) =>
    request('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, asService }),
    }),
  get: (projectId) => request(`/projects/${projectId}`),
  listServices: (projectId) => request(`/projects/${projectId}/services`),
  createService: (projectId, name) =>
    request(`/projects/${projectId}/services`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  getService: (projectId, serviceId) =>
    request(`/projects/${projectId}/services/${serviceId}`),
  createApiKey: (projectId, serviceId, name) =>
    request(`/projects/${projectId}/services/${serviceId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revokeApiKey: (projectId, serviceId, keyId) =>
    request(`/projects/${projectId}/services/${serviceId}/api-keys/${keyId}/revoke`, {
      method: 'POST',
    }),
};

/** Flat service routes (legacy service UUID = old project UUID). */
export const servicesAPI = {
  get: (serviceId) => request(`/services/${serviceId}`),
  createApiKey: (serviceId, name) =>
    request(`/services/${serviceId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revokeApiKey: (serviceId, keyId) =>
    request(`/services/${serviceId}/api-keys/${keyId}/revoke`, {
      method: 'POST',
    }),
};

export const inventoryAPI = {
  listEndpoints: (serviceId) => request(`/inventory/${serviceId}/endpoints`),
  getEndpoint: (serviceId, endpointId) =>
    request(`/inventory/${serviceId}/endpoints/${endpointId}`),
  /** OpenAPI 3.0 JSON document for the service inventory */
  exportOpenApi: (serviceId) => request(`/inventory/${serviceId}/openapi`),
  /** Dated evidence pack (inventory + signals + OpenAPI) */
  exportEvidence: (serviceId) => request(`/inventory/${serviceId}/evidence`),
};

/**
 * Billing contract (W3/W4) — resilient if routes are not mounted yet.
 * GET  /billing/me       → plan, usage, checkout/portal availability
 * GET  /billing/plans    → public catalog (Plan rows)
 * POST /billing/checkout → { url } (503 if Stripe not configured)
 * POST /billing/portal   → { url } (503 if Stripe not configured)
 */
export const billingAPI = {
  me: () => request('/billing/me'),
  plans: () => request('/billing/plans'),
  checkout: (body = {}) =>
    request('/billing/checkout', { method: 'POST', body: JSON.stringify(body) }),
  portal: (body = {}) =>
    request('/billing/portal', { method: 'POST', body: JSON.stringify(body) }),
  contactSales: (body = {}) =>
    request('/billing/contact-sales', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

/**
 * Usage & license (S1) — entitlement vs consumption.
 * GET /usage/me → plan, per-service endpoint quota, seats, totals
 */
export const usageAPI = {
  me: () => request('/usage/me'),
};

/**
 * Org members, invites & custom roles.
 * GET/PATCH/DELETE /orgs/:orgId/members[/:userId]
 * GET/POST/DELETE /orgs/:orgId/invites[/:inviteId]
 * GET/POST/PATCH/DELETE /orgs/:orgId/roles[/:roleId]
 * GET /invites/:token · POST /invites/:token/redeem · POST /invites/:token/accept
 */
export const orgsAPI = {
  listMembers: (orgId) => request(`/orgs/${orgId}/members`),
  updateMember: (orgId, userId, body) =>
    request(`/orgs/${orgId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removeMember: (orgId, userId) =>
    request(`/orgs/${orgId}/members/${userId}`, { method: 'DELETE' }),
  listInvites: (orgId) => request(`/orgs/${orgId}/invites`),
  createInvite: (orgId, body) =>
    request(`/orgs/${orgId}/invites`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeInvite: (orgId, inviteId) =>
    request(`/orgs/${orgId}/invites/${inviteId}`, { method: 'DELETE' }),
  listRoles: (orgId) => request(`/orgs/${orgId}/roles`),
  createRole: (orgId, body) =>
    request(`/orgs/${orgId}/roles`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateRole: (orgId, roleId, body) =>
    request(`/orgs/${orgId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteRole: (orgId, roleId) =>
    request(`/orgs/${orgId}/roles/${roleId}`, { method: 'DELETE' }),
};

export const invitesAPI = {
  get: (token) => request(`/invites/${token}`),
  /** Magic-link style: create/login invitee + join org in one request. */
  redeem: (token) => request(`/invites/${token}/redeem`, { method: 'POST' }),
  accept: (token) => request(`/invites/${token}/accept`, { method: 'POST' }),
};

export const adminAPI = {
  overview: () => request('/admin/overview'),
  listUsers: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.plan) qs.set('plan', params.plan);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : '';
    return request(`/admin/users${suffix}`);
  },
  assignUserPlan: (userId, planSlug) =>
    request(`/admin/users/${userId}/plan`, {
      method: 'PUT',
      body: JSON.stringify({ planSlug }),
    }),
  getUser: (userId) => request(`/admin/users/${userId}`),
  updateUserMembership: (userId, orgId, body) =>
    request(`/admin/users/${userId}/memberships/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removeUserMembership: (userId, orgId) =>
    request(`/admin/users/${userId}/memberships/${orgId}`, { method: 'DELETE' }),
  deleteUser: (userId) => request(`/admin/users/${userId}`, { method: 'DELETE' }),
  listLeads: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.plan) qs.set('plan', params.plan);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : '';
    return request(`/admin/leads${suffix}`);
  },
  listPlans: () => request('/admin/plans'),
  updatePlans: (plans) =>
    request('/admin/plans', { method: 'PUT', body: JSON.stringify({ plans }) }),
};
