/**
 * Local dev: empty VITE_API_URL → Vite proxy `/api` → core.
 * Production: set VITE_API_URL to the public core origin
 * (e.g. https://api.apiglimpse.com). Appends `/api` unless already present.
 */
function resolveApiBase() {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  if (!raw) return '/api';
  const base = raw.replace(/\/$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

const API_BASE = resolveApiBase();

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
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
