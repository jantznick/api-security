/**
 * SF7 PM1 — detect-only policy suggestions from inventory.
 * Suggest deny/require-auth rules for endpoints that look sensitive and have
 * never observed auth (authModes empty or only "none").
 */

const SENSITIVE_CATEGORIES = new Set([
  'password',
  'secret',
  'ssn',
  'card',
  'token',
  'email',
  'phone',
  'pii',
]);

const HIGHISH = new Set(['high', 'critical', 'medium']);

/**
 * @param {unknown} authModes
 * @returns {boolean} true when no real auth was observed
 */
export function hasNoAuthObserved(authModes) {
  const modes = Array.isArray(authModes) ? authModes.map((m) => String(m).toLowerCase()) : [];
  if (modes.length === 0) return true;
  const real = modes.filter((m) => m && m !== 'none');
  return real.length === 0;
}

/**
 * @param {Array<{ type?: string, category?: string, severity?: string, fieldPath?: string }>} signals
 */
export function pickSensitiveSignals(signals) {
  const list = Array.isArray(signals) ? signals : [];
  return list.filter((s) => {
    if (String(s.type || '') === 'auth_observed') return false;
    const cat = String(s.category || '').toLowerCase();
    const sev = String(s.severity || '').toLowerCase();
    if (SENSITIVE_CATEGORIES.has(cat)) return true;
    if (HIGHISH.has(sev) && String(s.type || '') === 'sensitive_field') return true;
    return false;
  });
}

/**
 * Build checklist-style policy suggestions (not enforced).
 *
 * @param {Array<object>} endpoints — Endpoint rows with optional `signals`
 * @returns {{ suggestions: object[], summary: object }}
 */
export function buildPolicySuggestions(endpoints) {
  const suggestions = [];

  for (const ep of endpoints || []) {
    if (!hasNoAuthObserved(ep.authModes)) continue;
    const sensitive = pickSensitiveSignals(ep.signals);
    if (sensitive.length === 0) continue;

    const worst = sensitive.reduce((acc, s) => {
      const sev = String(s.severity || 'info').toLowerCase();
      if (sev === 'critical') return 'critical';
      if (sev === 'high' && acc !== 'critical') return 'high';
      if (sev === 'medium' && acc !== 'critical' && acc !== 'high') return 'medium';
      return acc;
    }, 'low');

    const ruleId = `suggest-require-auth-${ep.method}-${ep.pathTemplate}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120);

    suggestions.push({
      id: ruleId,
      kind: 'require_auth',
      priority: worst === 'critical' || worst === 'high' ? 'high' : 'medium',
      reason:
        'Endpoint exposes sensitive fields and traffic was observed with no authentication.',
      checklist: [
        'Confirm this route should require authentication',
        'Add auth middleware (bearer / session) in the app',
        'Optionally enable Protect observe mode to count would-block hits',
      ],
      endpoint: {
        id: ep.id,
        method: ep.method,
        pathTemplate: ep.pathTemplate,
        hitCount: ep.hitCount,
        authModes: ep.authModes,
      },
      signals: sensitive.map((s) => ({
        type: s.type,
        fieldPath: s.fieldPath,
        category: s.category,
        severity: s.severity,
      })),
      /** Sketch rule for future protect policy cache (not applied automatically). */
      proposedRule: {
        id: ruleId,
        match: {
          pathTemplate: ep.pathTemplate,
          method: ep.method,
          authModes: ['none'],
        },
        action: 'deny',
      },
    });
  }

  suggestions.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
  });

  return {
    suggestions,
    summary: {
      total: suggestions.length,
      high: suggestions.filter((s) => s.priority === 'high').length,
      medium: suggestions.filter((s) => s.priority === 'medium').length,
    },
  };
}
