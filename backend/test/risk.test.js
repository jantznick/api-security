/**
 * Unit tests for SF1 risk posture scorer (pure functions, no DB).
 * Run: cd backend && npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregatePosture,
  categorizeSignals,
  cookieOnlyAuth,
  isMutatingMethod,
  isSensitiveRoute,
  neverObservedAuth,
  normalizeAuthModes,
  scoreEndpoint,
  scoreServicePosture,
} from '../lib/risk.js';

describe('normalizeAuthModes / auth helpers', () => {
  it('normalizes mixed authModes arrays', () => {
    assert.deepEqual(normalizeAuthModes(['Bearer', ' COOKIE ', 'none']), [
      'bearer',
      'cookie',
      'none',
    ]);
    assert.deepEqual(normalizeAuthModes(null), []);
    assert.deepEqual(normalizeAuthModes('bearer'), []);
  });

  it('detects never-observed auth', () => {
    assert.equal(neverObservedAuth([]), true);
    assert.equal(neverObservedAuth(['none']), true);
    assert.equal(neverObservedAuth(['none', 'none']), true);
    assert.equal(neverObservedAuth(['bearer']), false);
    assert.equal(neverObservedAuth(['none', 'cookie']), false);
  });

  it('detects cookie-only auth', () => {
    assert.equal(cookieOnlyAuth(['cookie']), true);
    assert.equal(cookieOnlyAuth(['cookie', 'none']), true);
    assert.equal(cookieOnlyAuth(['cookie', 'bearer']), false);
    assert.equal(cookieOnlyAuth(['none']), false);
    assert.equal(cookieOnlyAuth([]), false);
  });
});

describe('route / method helpers', () => {
  it('flags mutating methods', () => {
    assert.equal(isMutatingMethod('POST'), true);
    assert.equal(isMutatingMethod('put'), true);
    assert.equal(isMutatingMethod('PATCH'), true);
    assert.equal(isMutatingMethod('DELETE'), true);
    assert.equal(isMutatingMethod('GET'), false);
    assert.equal(isMutatingMethod('HEAD'), false);
  });

  it('flags sensitive path templates', () => {
    assert.equal(isSensitiveRoute('/api/users/{id}'), true);
    assert.equal(isSensitiveRoute('/auth/login'), true);
    assert.equal(isSensitiveRoute('/v1/billing/invoices'), true);
    assert.equal(isSensitiveRoute('/health'), false);
    assert.equal(isSensitiveRoute('/api/widgets/{id}'), false);
  });
});

describe('categorizeSignals', () => {
  it('splits high vs medium sensitive_field categories', () => {
    const result = categorizeSignals([
      { type: 'sensitive_field', category: 'card' },
      { type: 'sensitive_field', category: 'email' },
      { type: 'sensitive_field', category: 'ssn' },
      { type: 'sensitive_field', category: 'phone' },
      { type: 'sensitive_field', category: 'pii' },
      { type: 'auth_observed', category: 'none' },
      { type: 'sensitive_field', category: 'token' },
    ]);
    assert.deepEqual(result.highCategories, ['card', 'ssn']);
    assert.deepEqual(result.mediumCategories, ['email', 'phone', 'pii']);
  });
});

describe('scoreEndpoint fixtures', () => {
  it('scores high for card/ssn/password/secret signals', () => {
    const scored = scoreEndpoint({
      id: 'ep-card',
      method: 'GET',
      pathTemplate: '/api/orders/{id}',
      authModes: ['bearer'],
      signals: [{ type: 'sensitive_field', category: 'card', fieldPath: 'body.pan' }],
    });
    assert.equal(scored.severity, 'high');
    assert.ok(scored.reasons.some((r) => /card/i.test(r)));
  });

  it('scores high when mutating route never saw auth', () => {
    const scored = scoreEndpoint({
      id: 'ep-post',
      method: 'POST',
      pathTemplate: '/api/widgets',
      authModes: ['none'],
      signals: [],
    });
    assert.equal(scored.severity, 'high');
    assert.ok(scored.reasons.some((r) => /No auth observed on mutating/i.test(r)));
  });

  it('scores high when sensitive GET never saw auth', () => {
    const scored = scoreEndpoint({
      id: 'ep-users',
      method: 'GET',
      pathTemplate: '/api/users/{id}',
      authModes: [],
      signals: [],
    });
    assert.equal(scored.severity, 'high');
    assert.ok(scored.reasons.some((r) => /No auth observed on sensitive/i.test(r)));
  });

  it('scores medium for email/phone/pii', () => {
    const scored = scoreEndpoint({
      id: 'ep-email',
      method: 'GET',
      pathTemplate: '/api/directory',
      authModes: ['bearer'],
      signals: [{ type: 'sensitive_field', category: 'email', fieldPath: 'body.email' }],
    });
    assert.equal(scored.severity, 'medium');
    assert.ok(scored.reasons.some((r) => /email/i.test(r)));
  });

  it('scores medium for cookie-only auth', () => {
    const scored = scoreEndpoint({
      id: 'ep-cookie',
      method: 'GET',
      pathTemplate: '/api/widgets',
      authModes: ['cookie'],
      signals: [],
    });
    assert.equal(scored.severity, 'medium');
    assert.ok(scored.reasons.some((r) => /Cookie-only/i.test(r)));
  });

  it('scores low when healthy', () => {
    const scored = scoreEndpoint({
      id: 'ep-ok',
      method: 'GET',
      pathTemplate: '/api/widgets/{id}',
      authModes: ['bearer'],
      hitCount: 12,
      signals: [],
    });
    assert.equal(scored.severity, 'low');
    assert.deepEqual(scored.reasons, ['No elevated risk factors']);
  });

  it('does not flag auth gap on non-sensitive GET with none auth', () => {
    const scored = scoreEndpoint({
      id: 'ep-public',
      method: 'GET',
      pathTemplate: '/health',
      authModes: ['none'],
      signals: [],
    });
    assert.equal(scored.severity, 'low');
  });
});

describe('scoreServicePosture / aggregatePosture', () => {
  const fixtures = [
    {
      id: '1',
      method: 'POST',
      pathTemplate: '/api/checkout',
      authModes: ['none'],
      signals: [{ type: 'sensitive_field', category: 'card' }],
    },
    {
      id: '2',
      method: 'GET',
      pathTemplate: '/api/directory',
      authModes: ['bearer'],
      signals: [{ type: 'sensitive_field', category: 'email' }],
    },
    {
      id: '3',
      method: 'GET',
      pathTemplate: '/api/widgets',
      authModes: ['cookie'],
      signals: [],
    },
    {
      id: '4',
      method: 'GET',
      pathTemplate: '/health',
      authModes: ['none'],
      signals: [],
    },
  ];

  it('returns score + counts + per-endpoint reasons', () => {
    const posture = scoreServicePosture(fixtures);
    assert.equal(posture.score, 'high');
    assert.equal(posture.highCount, 1);
    assert.equal(posture.mediumCount, 2);
    assert.equal(posture.lowCount, 1);
    assert.equal(posture.endpoints.length, 4);
    assert.equal(posture.endpoints[0].severity, 'high');
    assert.ok(Array.isArray(posture.endpoints[0].reasons));
    assert.ok(posture.endpoints[0].reasons.length > 0);
  });

  it('aggregatePosture scores medium when no highs', () => {
    const scored = [
      scoreEndpoint(fixtures[1]),
      scoreEndpoint(fixtures[2]),
      scoreEndpoint(fixtures[3]),
    ];
    const posture = aggregatePosture(scored);
    assert.equal(posture.score, 'medium');
    assert.equal(posture.highCount, 0);
    assert.equal(posture.mediumCount, 2);
    assert.equal(posture.lowCount, 1);
  });

  it('aggregatePosture scores low when all healthy', () => {
    const posture = scoreServicePosture([fixtures[3]]);
    assert.equal(posture.score, 'low');
    assert.equal(posture.highCount, 0);
    assert.equal(posture.mediumCount, 0);
    assert.equal(posture.lowCount, 1);
  });
});
