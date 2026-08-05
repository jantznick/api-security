/**
 * Path templating for discovery.
 *
 * Goals for POC:
 * - Collapse numeric / UUID / hex / email segments into stable placeholders
 * - Avoid explosion (/users/1, /users/2, …)
 * - Avoid over-collapse of static multi-segment paths
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d{1,18}$/;
const HEX_RE = /^[0-9a-f]{8,64}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const BASE64ISH_RE = /^[A-Za-z0-9_-]{20,}$/;

/** Segments that look like resource names — never template these. */
const STATIC_HINTS = new Set([
  'api',
  'v1',
  'v2',
  'v3',
  'users',
  'user',
  'orders',
  'order',
  'products',
  'product',
  'auth',
  'login',
  'logout',
  'register',
  'health',
  'me',
  'search',
  'admin',
  'public',
  'private',
  'webhooks',
  'webhook',
  'items',
  'item',
  'cart',
  'checkout',
  'payments',
  'payment',
  'profiles',
  'profile',
  'settings',
  'accounts',
  'account',
]);

function classifySegment(segment) {
  if (!segment) return segment;
  if (STATIC_HINTS.has(segment.toLowerCase())) return segment;
  if (UUID_RE.test(segment)) return '{uuid}';
  if (ULID_RE.test(segment)) return '{ulid}';
  if (EMAIL_RE.test(segment)) return '{email}';
  if (NUMERIC_RE.test(segment)) return '{id}';
  if (HEX_RE.test(segment) && segment.length >= 16) return '{hex}';
  // Long opaque tokens in path (not short words)
  if (BASE64ISH_RE.test(segment) && !/^[a-z]+$/i.test(segment) && segment.length >= 24) {
    return '{token}';
  }
  return segment;
}

/**
 * @param {string} rawPath
 * @returns {string} normalized path template
 */
export function normalizePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '/';

  let path = rawPath.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;

  // Collapse duplicate slashes
  path = path.replace(/\/+/g, '/');

  // Strip trailing slash except root
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  const parts = path.split('/').map((seg, idx) => {
    if (idx === 0 && seg === '') return '';
    return classifySegment(seg);
  });

  const joined = parts.join('/') || '/';
  return joined.startsWith('/') ? joined : `/${joined}`;
}

export function endpointKey(method, pathTemplate) {
  return `${String(method).toUpperCase()} ${pathTemplate}`;
}
