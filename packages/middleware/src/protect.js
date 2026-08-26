/**
 * Protect mode — local policy evaluate for Express middleware (SF7 PM0–PM2).
 * Default: disabled. Observe counts would-block; block denies but fail-open.
 */

/**
 * Match pathTemplate patterns:
 * - exact string
 * - trailing /** wildcard (prefix match)
 * - :param segments treated as single path segments
 *
 * @param {string} template
 * @param {string} path
 */
export function matchPathTemplate(template, path) {
  const t = String(template || '');
  const p = String(path || '').split('?')[0] || '/';
  if (!t) return false;
  if (t === p) return true;
  if (t.endsWith('/**')) {
    const prefix = t.slice(0, -3);
    return p === prefix || p.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`) || p.startsWith(prefix);
  }
  const tParts = t.split('/').filter(Boolean);
  const pParts = p.split('/').filter(Boolean);
  if (tParts.length !== pParts.length) return false;
  for (let i = 0; i < tParts.length; i += 1) {
    const tp = tParts[i];
    const pp = pParts[i];
    if (tp.startsWith(':') || tp === '*') continue;
    if (tp !== pp) return false;
  }
  return true;
}

/**
 * @param {object} rule
 * @param {{ method: string, path: string, authObserved: string }} ctx
 */
export function ruleMatches(rule, ctx) {
  const match = rule?.match || {};
  if (match.method) {
    const methods = Array.isArray(match.method) ? match.method : [match.method];
    if (!methods.map((m) => String(m).toUpperCase()).includes(String(ctx.method).toUpperCase())) {
      return false;
    }
  }
  if (match.pathTemplate && !matchPathTemplate(match.pathTemplate, ctx.path)) {
    return false;
  }
  if (Array.isArray(match.authModes) && match.authModes.length > 0) {
    const observed = String(ctx.authObserved || 'none').toLowerCase();
    const allowed = match.authModes.map((a) => String(a).toLowerCase());
    if (!allowed.includes(observed)) return false;
  }
  return true;
}

/**
 * @param {object | null} policy
 * @param {{ method: string, path: string, authObserved: string }} ctx
 * @returns {{ matched: boolean, rule: object | null }}
 */
export function evaluatePolicy(policy, ctx) {
  try {
    const rules = Array.isArray(policy?.rules) ? policy.rules : [];
    for (const rule of rules) {
      if (String(rule.action || '').toLowerCase() !== 'deny') continue;
      if (ruleMatches(rule, ctx)) {
        return { matched: true, rule };
      }
    }
    return { matched: false, rule: null };
  } catch {
    return { matched: false, rule: null };
  }
}

/**
 * Create a protect evaluator with cached policy + stub/periodic fetch.
 *
 * @param {object} protectCfg
 * @param {boolean} [protectCfg.enabled]
 * @param {'observe'|'block'|'shadow'} [protectCfg.mode]
 * @param {string} [protectCfg.policyUrl]
 * @param {'open'|'closed'} [protectCfg.failMode] — product default is open; closed never defaulted
 * @param {number} [protectCfg.refreshIntervalMs]
 * @param {object} [protectCfg.policy] — inline policy (tests / offline)
 * @param {(ctx: object) => void} [protectCfg.onDeny]
 */
export function createProtectController(protectCfg = {}) {
  const enabled = Boolean(protectCfg.enabled);
  const mode = String(protectCfg.mode || 'observe').toLowerCase();
  // Never default to fail-closed
  const failMode = protectCfg.failMode === 'closed' ? 'closed' : 'open';
  const refreshIntervalMs = Number(protectCfg.refreshIntervalMs || 60_000);
  const policyUrl = protectCfg.policyUrl || null;

  let policy = protectCfg.policy || null;
  let lastFetchError = null;
  const stats = {
    evaluated: 0,
    wouldBlock: 0,
    blocked: 0,
    allowed: 0,
    errors: 0,
  };

  async function refreshPolicy() {
    if (!policyUrl) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(policyUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastFetchError = `HTTP ${res.status}`;
        return;
      }
      const body = await res.json();
      if (body && typeof body === 'object') {
        policy = {
          version: body.version ?? 1,
          fetchedAt: body.fetchedAt || new Date().toISOString(),
          rules: Array.isArray(body.rules) ? body.rules : [],
        };
        lastFetchError = null;
      }
    } catch (err) {
      lastFetchError = err?.message || 'policy fetch failed';
      // fail-open: keep previous cache
    }
  }

  let refreshTimer = null;
  if (enabled && policyUrl) {
    refreshPolicy().catch(() => {});
    refreshTimer = setInterval(() => {
      refreshPolicy().catch(() => {});
    }, refreshIntervalMs);
    if (typeof refreshTimer.unref === 'function') refreshTimer.unref();
  }

  /**
   * @param {{ method: string, path: string, authObserved: string, req?: object, res?: object }} ctx
   * @returns {{ allow: boolean, wouldBlock: boolean, blocked: boolean, rule: object | null }}
   */
  function decide(ctx) {
    if (!enabled) {
      return { allow: true, wouldBlock: false, blocked: false, rule: null };
    }

    stats.evaluated += 1;

    try {
      if (!policy || !Array.isArray(policy.rules)) {
        // Missing policy → fail-open unless explicit closed (not product default)
        if (failMode === 'closed') {
          stats.blocked += 1;
          return { allow: false, wouldBlock: true, blocked: true, rule: null };
        }
        stats.allowed += 1;
        return { allow: true, wouldBlock: false, blocked: false, rule: null };
      }

      const { matched, rule } = evaluatePolicy(policy, ctx);
      if (!matched) {
        stats.allowed += 1;
        return { allow: true, wouldBlock: false, blocked: false, rule: null };
      }

      if (mode === 'block') {
        stats.wouldBlock += 1;
        stats.blocked += 1;
        return { allow: false, wouldBlock: true, blocked: true, rule };
      }

      // observe / shadow — allow but count
      stats.wouldBlock += 1;
      stats.allowed += 1;
      return { allow: true, wouldBlock: true, blocked: false, rule };
    } catch {
      stats.errors += 1;
      if (failMode === 'closed') {
        stats.blocked += 1;
        return { allow: false, wouldBlock: true, blocked: true, rule: null };
      }
      stats.allowed += 1;
      return { allow: true, wouldBlock: false, blocked: false, rule: null };
    }
  }

  function getStats() {
    return { ...stats, mode, enabled, failMode, lastFetchError, policyVersion: policy?.version ?? null };
  }

  function stop() {
    if (refreshTimer) clearInterval(refreshTimer);
  }

  return { decide, refreshPolicy, getStats, stop, getPolicy: () => policy };
}
