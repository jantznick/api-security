/**
 * SF7 phase 1 — policy suggestions from inventory (detect-only).
 * Sensitive + no auth → suggest deny-unauth rules. Does not enforce.
 */

import { neverObservedAuth, isMutatingMethod, isSensitiveRoute, categorizeSignals } from './risk.js';

/**
 * @param {object[]} endpoints — with signals
 * @returns {{ suggestions: object[] }}
 */
export function buildPolicySuggestions(endpoints) {
  const suggestions = [];
  for (const ep of endpoints || []) {
    const method = String(ep.method || '').toUpperCase();
    const path = String(ep.pathTemplate || '/');
    const authModes = ep.authModes;
    const signals = Array.isArray(ep.signals) ? ep.signals : [];
    const { highCategories, mediumCategories } = categorizeSignals(signals);
    const noAuth = neverObservedAuth(authModes);
    const sensitive = isSensitiveRoute(path) || highCategories.length > 0 || mediumCategories.length > 0;
    const mutating = isMutatingMethod(method);

    if (noAuth && (sensitive || mutating)) {
      suggestions.push({
        id: `deny-unauth-${method}-${path}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: `Require auth on ${method} ${path}`,
        reason:
          highCategories.length > 0
            ? `No auth observed; sensitive fields: ${highCategories.join(', ')}`
            : mutating
              ? 'No auth observed on mutating route'
              : 'No auth observed on sensitive route',
        severity: highCategories.length > 0 || mutating ? 'high' : 'medium',
        rule: {
          match: {
            method,
            pathTemplate: path,
            authModes: ['none'],
          },
          action: 'deny',
        },
      });
    }
  }
  return { suggestions };
}
