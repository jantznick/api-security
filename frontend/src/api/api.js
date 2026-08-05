const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
};

export const inventoryAPI = {
  listEndpoints: (projectId) => request(`/inventory/${projectId}/endpoints`),
  getEndpoint: (projectId, endpointId) =>
    request(`/inventory/${projectId}/endpoints/${endpointId}`),
};
