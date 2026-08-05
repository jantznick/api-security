/** Shared sample envelope version — bump when wire format changes. */
export const ENVELOPE_VERSION = 1;

/** Header names always stripped / redacted before leaving the app process. */
export const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

const MAX_STRING = 64;
const MAX_DEPTH = 4;
const MAX_KEYS = 40;
const MAX_ARRAY_ITEMS = 5;

export function truncateString(value, max = MAX_STRING) {
  const s = String(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/**
 * Redact sensitive header values; keep names for auth observation.
 * @param {Record<string, string | string[] | undefined>} headers
 */
export function redactHeaders(headers = {}) {
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    const val = Array.isArray(rawVal) ? rawVal.join(', ') : String(rawVal ?? '');
    out[key] = truncateString(val, 128);
  }
  return out;
}

/**
 * Best-effort value redaction for known secret-ish patterns.
 */
export function redactValue(value) {
  if (typeof value !== 'string') return value;
  if (/^Bearer\s+/i.test(value)) return 'Bearer [REDACTED]';
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)) {
    return '[REDACTED_JWT]';
  }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(value)) return '[REDACTED_SSN]';
  if (/\b(?:\d[ -]*?){13,19}\b/.test(value)) return '[REDACTED_CARD]';
  return truncateString(value);
}

/**
 * Convert a JSON body into a truncated shape sample (types + short values).
 * Never intended for long-term storage — agent derives schema and discards.
 */
export function shapeBody(body, depth = 0) {
  if (body === null || body === undefined) {
    return { type: body === null ? 'null' : 'undefined' };
  }

  if (depth >= MAX_DEPTH) {
    return { type: 'truncated' };
  }

  const t = typeof body;
  if (t === 'string') {
    return { type: 'string', sample: redactValue(body) };
  }
  if (t === 'number') {
    return { type: Number.isInteger(body) ? 'integer' : 'number', sample: body };
  }
  if (t === 'boolean') {
    return { type: 'boolean', sample: body };
  }

  if (Array.isArray(body)) {
    const items = body.slice(0, MAX_ARRAY_ITEMS).map((item) => shapeBody(item, depth + 1));
    return {
      type: 'array',
      length: body.length,
      items,
    };
  }

  if (t === 'object') {
    const keys = Object.keys(body).slice(0, MAX_KEYS);
    const properties = {};
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('ssn') ||
        lower === 'cvv' ||
        lower === 'cvc'
      ) {
        properties[key] = { type: 'string', sample: '[REDACTED]' };
      } else {
        properties[key] = shapeBody(body[key], depth + 1);
      }
    }
    return {
      type: 'object',
      properties,
      truncatedKeys: Object.keys(body).length > MAX_KEYS,
    };
  }

  return { type: 'unknown' };
}
