import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPolicySuggestions,
  hasNoAuthObserved,
  pickSensitiveSignals,
} from '../lib/policySuggestions.js';
import {
  buildOutboundWebhookPayload,
  isHighSeverity,
  resolveIntegrationUrls,
} from '../lib/webhooks.js';

describe('policySuggestions', () => {
  it('detects no auth', () => {
    assert.equal(hasNoAuthObserved([]), true);
    assert.equal(hasNoAuthObserved(['none']), true);
    assert.equal(hasNoAuthObserved(['bearer']), false);
    assert.equal(hasNoAuthObserved(['none', 'bearer']), false);
  });

  it('picks sensitive signals', () => {
    const picks = pickSensitiveSignals([
      { type: 'auth_observed', category: 'none', severity: 'low' },
      { type: 'sensitive_field', category: 'password', severity: 'high', fieldPath: 'body.password' },
      { type: 'sensitive_field', category: 'other', severity: 'info', fieldPath: 'body.x' },
    ]);
    assert.equal(picks.length, 1);
    assert.equal(picks[0].category, 'password');
  });

  it('builds suggestions for sensitive + unauth endpoints', () => {
    const { suggestions, summary } = buildPolicySuggestions([
      {
        id: 'e1',
        method: 'POST',
        pathTemplate: '/checkout',
        hitCount: 10,
        authModes: ['none'],
        signals: [
          { type: 'sensitive_field', category: 'card', severity: 'high', fieldPath: 'body.pan' },
        ],
      },
      {
        id: 'e2',
        method: 'GET',
        pathTemplate: '/health',
        hitCount: 100,
        authModes: ['none'],
        signals: [],
      },
      {
        id: 'e3',
        method: 'GET',
        pathTemplate: '/me',
        hitCount: 5,
        authModes: ['bearer'],
        signals: [
          { type: 'sensitive_field', category: 'email', severity: 'medium', fieldPath: 'body.email' },
        ],
      },
    ]);
    assert.equal(summary.total, 1);
    assert.equal(suggestions[0].endpoint.pathTemplate, '/checkout');
    assert.equal(suggestions[0].kind, 'require_auth');
    assert.equal(suggestions[0].proposedRule.action, 'deny');
    assert.ok(Array.isArray(suggestions[0].checklist));
  });
});

describe('webhooks helpers', () => {
  it('classifies high severity', () => {
    assert.equal(isHighSeverity('high'), true);
    assert.equal(isHighSeverity('critical'), true);
    assert.equal(isHighSeverity('medium'), false);
  });

  it('resolves service over project urls', () => {
    const r = resolveIntegrationUrls(
      { webhookUrl: 'https://svc.example/hook', slackWebhookUrl: null },
      { webhookUrl: 'https://proj.example/hook', slackWebhookUrl: 'https://hooks.slack.com/x' },
    );
    assert.equal(r.webhookUrl, 'https://svc.example/hook');
    assert.equal(r.slackWebhookUrl, 'https://hooks.slack.com/x');
  });

  it('builds zapier/make payload shape', () => {
    const payload = buildOutboundWebhookPayload({
      event: 'signal.high_severity',
      service: { id: 's1', name: 'API', projectId: 'p1' },
      project: { id: 'p1', name: 'Default', organizationId: 'o1' },
      endpoint: { id: 'e1', method: 'POST', pathTemplate: '/pay' },
      signal: {
        id: 'sig1',
        type: 'sensitive_field',
        fieldPath: 'body.pan',
        category: 'card',
        severity: 'high',
      },
    });
    assert.equal(payload.version, 1);
    assert.equal(payload.event, 'signal.high_severity');
    assert.equal(payload.signal.category, 'card');
    assert.ok(payload.occurredAt);
  });
});
