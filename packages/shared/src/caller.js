/**
 * Caller / client hints for lightweight topology (SF3).
 * Additive on envelope v1 samples — older agents ignore unknown fields.
 */

const UA_BROWSER_RE =
  /Mozilla\/|Chrome\/|Safari\/|Firefox\/|Edg\/|OPR\/|AppleWebKit/i;
const UA_SDK_RE =
  /axios\/|node-fetch|undici|got\/|python-requests|httpx\/|Go-http-client|okhttp|Java\/|Faraday|RestSharp|apiglimpse/i;
const UA_CURL_RE = /^curl\//i;

/**
 * Classify User-Agent into a coarse family for blast-radius UX.
 * @param {string | string[] | undefined | null} userAgent
 * @returns {'browser' | 'sdk' | 'curl' | 'unknown'}
 */
export function classifyUserAgent(userAgent) {
  const ua = Array.isArray(userAgent)
    ? userAgent.join(' ')
    : String(userAgent || '').trim();
  if (!ua) return 'unknown';
  if (UA_CURL_RE.test(ua)) return 'curl';
  if (UA_SDK_RE.test(ua)) return 'sdk';
  if (UA_BROWSER_RE.test(ua)) return 'browser';
  return 'unknown';
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const want = name.toLowerCase();
  for (const [key, raw] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== want) continue;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return String(val || '').trim();
  }
  return '';
}

/**
 * Resolve caller hints from inbound headers and optional connector config.
 * Priority: x-service-name → x-client-name → options.serviceName / env.
 *
 * @param {Record<string, string | string[] | undefined>} [headers]
 * @param {{ serviceName?: string | null }} [options]
 * @returns {{ name: string | null, source: 'header' | 'config' | null, uaFamily: 'browser' | 'sdk' | 'curl' | 'unknown' }}
 */
export function resolveCallerHints(headers = {}, options = {}) {
  const uaFamily = classifyUserAgent(
    headerValue(headers, 'user-agent') || headers['user-agent'] || headers['User-Agent'],
  );

  const fromService = headerValue(headers, 'x-service-name');
  if (fromService) {
    return { name: truncateCallerName(fromService), source: 'header', uaFamily };
  }

  const fromClient = headerValue(headers, 'x-client-name');
  if (fromClient) {
    return { name: truncateCallerName(fromClient), source: 'header', uaFamily };
  }

  const fromConfig =
    (options.serviceName && String(options.serviceName).trim()) ||
    (typeof process !== 'undefined' &&
      process.env?.API_SENSOR_SERVICE_NAME &&
      String(process.env.API_SENSOR_SERVICE_NAME).trim()) ||
    '';

  if (fromConfig) {
    return { name: truncateCallerName(fromConfig), source: 'config', uaFamily };
  }

  return { name: null, source: null, uaFamily };
}

/**
 * Stable edge identity for aggregation / DB unique keys.
 * Prefers explicit name; otherwise falls back to UA family bucket.
 * @param {{ name?: string | null, uaFamily?: string | null }} caller
 */
export function callerEdgeKey(caller = {}) {
  const name = caller?.name ? String(caller.name).trim() : '';
  if (name) return `name:${name.toLowerCase()}`;
  const ua = caller?.uaFamily ? String(caller.uaFamily) : 'unknown';
  return `ua:${ua}`;
}

/**
 * Display label for a caller node.
 * @param {{ name?: string | null, uaFamily?: string | null }} caller
 */
export function callerDisplayName(caller = {}) {
  if (caller?.name) return String(caller.name);
  const ua = caller?.uaFamily || 'unknown';
  if (ua === 'browser') return 'Browser clients';
  if (ua === 'sdk') return 'SDK clients';
  if (ua === 'curl') return 'curl';
  return 'Unknown callers';
}

function truncateCallerName(name) {
  const s = String(name).slice(0, 128);
  return s || null;
}
