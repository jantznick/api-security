const trimSlash = (url) => url.replace(/\/$/, '');

export const APP_URL = trimSlash(
  import.meta.env.VITE_APP_URL || 'https://app.apiglimpse.com',
);
export const DOCS_URL = trimSlash(
  import.meta.env.VITE_DOCS_URL || 'https://docs.apiglimpse.com',
);
export const COLLECT_URL = import.meta.env.VITE_COLLECT_URL
  ? trimSlash(import.meta.env.VITE_COLLECT_URL)
  : null;

export const signupUrl = `${APP_URL}/register`;
export const signinUrl = `${APP_URL}/login`;
export const integratingDocsUrl = `${DOCS_URL}/integrating/`;
