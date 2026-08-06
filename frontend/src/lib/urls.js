const trimSlash = (url) => url.replace(/\/$/, '');

export const MARKETING_URL = trimSlash(
  import.meta.env.VITE_MARKETING_URL || 'https://apiglimpse.com',
);
export const APP_URL = trimSlash(
  import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : ''),
);
export const DOCS_URL = trimSlash(
  import.meta.env.VITE_DOCS_URL || 'https://docs.apiglimpse.com',
);
export const integratingDocsUrl = `${DOCS_URL}/integrating/`;

/** Absolute marketing auth URL, preserving query string. */
export function marketingAuthUrl(path, search = '') {
  const qs = search.startsWith('?') ? search : search ? `?${search}` : '';
  return `${MARKETING_URL}${path}${qs}`;
}

/** Marketing login with redirect back to an app URL. */
export function marketingLoginUrl(redirectTo) {
  const redirect = redirectTo || `${APP_URL || window.location.origin}/projects`;
  return `${MARKETING_URL}/login?redirect=${encodeURIComponent(redirect)}`;
}
