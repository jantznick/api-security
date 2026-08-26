/**
 * SF1 — Risk posture scoring (derived from Endpoint + Signal; no Finding table).
 *
 * v1 rules:
 * - High: card/ssn/password/secret signals; or never observed auth on
 *   mutating (POST/PUT/PATCH/DELETE) or sensitive routes
 * - Medium: email/phone/pii; cookie-only auth
 * - Low: none of the above / healthy
 */

const HIGH_SIGNAL_CATEGORIES = new Set(['card', 'ssn', 'password', 'secret']);
const MEDIUM_SIGNAL_CATEGORIES = new Set(['email', 'phone', 'pii']);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Paths that typically handle credentials, PII, payments, or admin. */
const SENSITIVE_PATH_RE =
  /\/(auth|login|logout|signup|register|password|passwd|secret|token|oauth|admin|billing|payment|pay|card|checkout|ssn|account|users?|profile|pii)\b/i;

const SEVERITY_RANK = Object.freeze({ high: 3, medium: 2, low: 1 });

/**
 * @param {unknown} authModes
 * @returns {string[]}
 */
export function normalizeAuthModes(authModes) {
  if (!Array.isArray(authModes)) return [];
  return authModes
    .map((m) => String(m || '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True when no bearer/cookie (or other non-none) auth was ever observed.
 * @param {unknown} authModes
 */
export function neverObservedAuth(authModes) {
  const modes = normalizeAuthModes(authModes);
  if (modes.length === 0) return true;
  return modes.every((m) => m === 'none');
}

/**
 * Cookie observed without bearer (or other stronger modes).
 * @param {unknown} authModes
 */
export function cookieOnlyAuth(authModes) {
  const modes = normalizeAuthModes(authModes).filter((m) => m !== 'none');
  return modes.length > 0 && modes.every((m) => m === 'cookie');
}

/**
 * @param {string} method
 */
export function isMutatingMethod(method) {
  return MUTATING_METHODS.has(String(method || '').toUpperCase());
}

/**
 * @param {string} pathTemplate
 */
export function isSensitiveRoute(pathTemplate) {
  return SENSITIVE_PATH_RE.test(String(pathTemplate || ''));
}

/**
 * @param {{ category?: string, type?: string }[]} signals
 * @returns {{ highCategories: string[], mediumCategories: string[] }}
 */
export function categorizeSignals(signals) {
  const highCategories = new Set();
  const mediumCategories = new Set();
  for (const s of signals || []) {
    if (s?.type && s.type !== 'sensitive_field') continue;
    const cat = String(s?.category || '')
      .trim()
      .toLowerCase();
    if (!cat) continue;
    if (HIGH_SIGNAL_CATEGORIES.has(cat)) highCategories.add(cat);
    else if (MEDIUM_SIGNAL_CATEGORIES.has(cat)) mediumCategories.add(cat);
  }
  return {
    highCategories: [...highCategories].sort(),
    mediumCategories: [...mediumCategories].sort(),
  };
}

/**
 * Score a single endpoint from its fields + signals.
 *
 * @param {{
 *   id?: string,
 *   method?: string,
 *   pathTemplate?: string,
 *   authModes?: unknown,
 *   hitCount?: number,
 *   lastSeenAt?: string|Date|null,
 *   signals?: Array<{ category?: string, type?: string, fieldPath?: string, severity?: string }>
 * }} endpoint
 * @returns {{
 *   id: string|null,
 *   method: string,
 *   pathTemplate: string,
 *   severity: 'high'|'medium'|'low',
 *   reasons: string[],
 *   hitCount: number|null,
 *   lastSeenAt: string|Date|null,
 *   authModes: string[],
 * }}
 */
export function scoreEndpoint(endpoint) {
  const method = String(endpoint?.method || '').toUpperCase() || 'GET';
  const pathTemplate = String(endpoint?.pathTemplate || '');
  const authModes = normalizeAuthModes(endpoint?.authModes);
  const signals = Array.isArray(endpoint?.signals) ? endpoint.signals : [];
  const { highCategories, mediumCategories } = categorizeSignals(signals);

  /** @type {string[]} */
  const reasons = [];
  let severity = 'low';

  if (highCategories.length) {
    severity = 'high';
    reasons.push(
      `Sensitive data signals: ${highCategories.join(', ')}`,
    );
  }

  const needsAuth = isMutatingMethod(method) || isSensitiveRoute(pathTemplate);
  if (needsAuth && neverObservedAuth(authModes)) {
    severity = 'high';
    const kind = isMutatingMethod(method) ? 'mutating' : 'sensitive';
    reasons.push(`No auth observed on ${kind} route (${method} ${pathTemplate || '/'})`);
  }

  if (severity !== 'high') {
    if (mediumCategories.length) {
      severity = 'medium';
      reasons.push(`PII signals: ${mediumCategories.join(', ')}`);
    }
    if (cookieOnlyAuth(authModes)) {
      severity = 'medium';
      reasons.push('Cookie-only auth observed (no bearer)');
    }
  } else {
    // Still surface medium factors as additional context when already high
    if (mediumCategories.length) {
      reasons.push(`Also PII signals: ${mediumCategories.join(', ')}`);
    }
    if (cookieOnlyAuth(authModes)) {
      reasons.push('Cookie-only auth observed (no bearer)');
    }
  }

  if (reasons.length === 0) {
    reasons.push('No elevated risk factors');
  }

  return {
    id: endpoint?.id ?? null,
    method,
    pathTemplate,
    severity,
    reasons,
    hitCount: typeof endpoint?.hitCount === 'number' ? endpoint.hitCount : null,
    lastSeenAt: endpoint?.lastSeenAt ?? null,
    authModes,
  };
}

/**
 * Aggregate scored endpoints into a service posture summary.
 *
 * @param {ReturnType<typeof scoreEndpoint>[]} scored
 * @returns {{
 *   score: 'high'|'medium'|'low',
 *   highCount: number,
 *   mediumCount: number,
 *   lowCount: number,
 *   endpoints: ReturnType<typeof scoreEndpoint>[],
 * }}
 */
export function aggregatePosture(scored) {
  const endpoints = [...(scored || [])].sort((a, b) => {
    const rankDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (rankDiff !== 0) return rankDiff;
    const pathCmp = String(a.pathTemplate).localeCompare(String(b.pathTemplate));
    if (pathCmp !== 0) return pathCmp;
    return String(a.method).localeCompare(String(b.method));
  });

  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  for (const ep of endpoints) {
    if (ep.severity === 'high') highCount += 1;
    else if (ep.severity === 'medium') mediumCount += 1;
    else lowCount += 1;
  }

  let score = 'low';
  if (highCount > 0) score = 'high';
  else if (mediumCount > 0) score = 'medium';

  return { score, highCount, mediumCount, lowCount, endpoints };
}

/**
 * Score a list of endpoints (with optional nested signals) into posture.
 * @param {Parameters<typeof scoreEndpoint>[0][]} endpoints
 */
export function scoreServicePosture(endpoints) {
  return aggregatePosture((endpoints || []).map(scoreEndpoint));
}

export const RISK_CONSTANTS = Object.freeze({
  HIGH_SIGNAL_CATEGORIES: [...HIGH_SIGNAL_CATEGORIES],
  MEDIUM_SIGNAL_CATEGORIES: [...MEDIUM_SIGNAL_CATEGORIES],
  MUTATING_METHODS: [...MUTATING_METHODS],
});
