/**
 * SF3 — lightweight caller hints for topology (not full APM).
 */

/**
 * @param {string|undefined|null} ua
 * @returns {'browser'|'sdk'|'curl'|'unknown'}
 */
export function classifyUserAgent(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('curl/') || s === 'curl') return 'curl';
  if (
    s.includes('mozilla/') ||
    s.includes('chrome/') ||
    s.includes('safari/') ||
    s.includes('firefox/') ||
    s.includes('edg/')
  ) {
    return 'browser';
  }
  if (
    s.includes('axios') ||
    s.includes('node-fetch') ||
    s.includes('go-http') ||
    s.includes('python-requests') ||
    s.includes('okhttp') ||
    s.includes('java/') ||
    s.includes('apiglimpse')
  ) {
    return 'sdk';
  }
  return 'unknown';
}

/**
 * Resolve caller identity from headers + optional configured service name.
 * @param {{ headers?: Record<string, string>, serviceName?: string|null }} input
 */
export function resolveCallerHints({ headers = {}, serviceName = null } = {}) {
  const h = headers || {};
  const lower = {};
  for (const [k, v] of Object.entries(h)) {
    lower[String(k).toLowerCase()] = v;
  }

  const explicit =
    String(lower['x-service-name'] || lower['x-client-name'] || serviceName || '').trim() ||
    null;
  const ua = lower['user-agent'] || '';
  const uaFamily = classifyUserAgent(ua);

  const key = explicit
    ? `svc:${explicit.toLowerCase()}`
    : `ua:${uaFamily}`;
  const label = explicit || `ua:${uaFamily}`;

  return {
    key,
    label,
    serviceName: explicit,
    userAgentFamily: uaFamily,
  };
}

export function callerEdgeKey(callerKey, method, pathTemplate) {
  return `${callerKey}|${String(method || '').toUpperCase()}|${pathTemplate || '/'}`;
}

export function callerDisplayName(caller) {
  if (!caller) return 'unknown';
  return caller.label || caller.key || 'unknown';
}
