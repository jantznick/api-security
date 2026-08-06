const trimSlash = (url) => url.replace(/\/$/, '');

const isDev = import.meta.env.DEV;

export const APP_URL = trimSlash(
  import.meta.env.VITE_APP_URL ||
    (isDev ? 'http://localhost:5173' : 'https://app.apiglimpse.com'),
);
export const DOCS_URL = trimSlash(
  import.meta.env.VITE_DOCS_URL ||
    (isDev ? 'http://localhost:5175' : 'https://docs.apiglimpse.com'),
);
export const COLLECT_URL = import.meta.env.VITE_COLLECT_URL
  ? trimSlash(import.meta.env.VITE_COLLECT_URL)
  : null;

/** Deep-link helpers — prefer openAuth() from AuthModalContext when on-site. */
export const signupUrl = '/?auth=register';
export const signinUrl = '/?auth=login';
export const integratingDocsUrl = `${DOCS_URL}/integrating/`;

export const appProjectsUrl = `${APP_URL}/projects`;

/**
 * Resolve where to send the user after successful auth.
 * Allows absolute app URLs or relative app paths via ?redirect=.
 */
export function resolvePostAuthRedirect(redirectParam) {
  const fallback = appProjectsUrl;
  if (!redirectParam) return fallback;

  try {
    if (redirectParam.startsWith('/')) {
      return `${APP_URL}${redirectParam}`;
    }
    const target = new URL(redirectParam);
    const appOrigin = new URL(APP_URL).origin;
    if (target.origin === appOrigin) {
      return target.toString();
    }
  } catch {
    /* ignore */
  }
  return fallback;
}
