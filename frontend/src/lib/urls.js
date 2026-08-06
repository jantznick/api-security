const trimSlash = (url) => url.replace(/\/$/, '');

const isDev = import.meta.env.DEV;

export const MARKETING_URL = trimSlash(
  import.meta.env.VITE_MARKETING_URL ||
    (isDev ? 'http://localhost:5174' : 'https://apiglimpse.com'),
);
export const APP_URL = trimSlash(
  import.meta.env.VITE_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '') ||
    (isDev ? 'http://localhost:5173' : ''),
);
export const DOCS_URL = trimSlash(
  import.meta.env.VITE_DOCS_URL ||
    (isDev ? 'http://localhost:5175' : 'https://docs.apiglimpse.com'),
);
export const integratingDocsUrl = `${DOCS_URL}/integrating/`;

/** Absolute marketing auth deep link (optional cross-origin). */
export function marketingAuthUrl(path, search = '') {
  const qs = search.startsWith('?') ? search : search ? `?${search}` : '';
  return `${MARKETING_URL}${path}${qs}`;
}

/** Marketing site with auth modal tab. */
export function marketingLoginUrl(redirectTo, tab = 'login') {
  const redirect = redirectTo || `${APP_URL || window.location.origin}/projects`;
  return `${MARKETING_URL}/?auth=${tab}&redirect=${encodeURIComponent(redirect)}`;
}

/**
 * In-app welcome + auth modal.
 * @param {string} [redirectTo] path or absolute same-origin URL after auth
 * @param {'login'|'register'} [tab]
 */
export function loginUrl(redirectTo, tab = 'login') {
  const params = new URLSearchParams();
  params.set('auth', tab === 'register' ? 'register' : 'login');
  if (redirectTo) {
    let path = '/projects';
    if (redirectTo.startsWith('/')) {
      path = redirectTo;
    } else {
      try {
        const target = new URL(redirectTo);
        if (typeof window !== 'undefined' && target.origin === window.location.origin) {
          path = `${target.pathname}${target.search}` || '/projects';
        }
      } catch {
        /* keep default */
      }
    }
    params.set('redirect', path);
  }
  return `/?${params.toString()}`;
}
