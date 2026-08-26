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
};

export const projectsAPI = {
  list: () => request('/projects'),
  create: (name) =>
    request('/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  get: (projectId) => request(`/projects/${projectId}`),
  createApiKey: (projectId, name) =>
    request(`/projects/${projectId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revokeApiKey: (projectId, keyId) =>
    request(`/projects/${projectId}/api-keys/${keyId}/revoke`, {
      method: 'POST',
    }),
};

export const inventoryAPI = {
  listEndpoints: (projectId) => request(`/inventory/${projectId}/endpoints`),
  getEndpoint: (projectId, endpointId) =>
    request(`/inventory/${projectId}/endpoints/${endpointId}`),
  /** OpenAPI 3.0 JSON document for the project inventory */
  exportOpenApi: (projectId) => request(`/inventory/${projectId}/openapi`),
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
  listPlans: () => request('/admin/plans'),
  updatePlans: (plans) =>
    request('/admin/plans', { method: 'PUT', body: JSON.stringify({ plans }) }),
};
