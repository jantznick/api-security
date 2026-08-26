import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyUserAgent,
  resolveCallerHints,
  callerEdgeKey,
  callerDisplayName,
  createSample,
} from '../src/index.js';

describe('classifyUserAgent', () => {
  it('detects browser, sdk, curl, unknown', () => {
    assert.equal(
      classifyUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
      ),
      'browser',
    );
    assert.equal(classifyUserAgent('axios/1.6.0'), 'sdk');
    assert.equal(classifyUserAgent('python-requests/2.31.0'), 'sdk');
    assert.equal(classifyUserAgent('curl/8.4.0'), 'curl');
    assert.equal(classifyUserAgent('CustomBot/1.0'), 'unknown');
    assert.equal(classifyUserAgent(''), 'unknown');
  });
});

describe('resolveCallerHints', () => {
  it('prefers x-service-name over x-client-name and config', () => {
    const hints = resolveCallerHints(
      {
        'x-service-name': 'billing-svc',
        'x-client-name': 'ignored',
        'user-agent': 'curl/8.0',
      },
      { serviceName: 'config-name' },
    );
    assert.deepEqual(hints, {
      name: 'billing-svc',
      source: 'header',
      uaFamily: 'curl',
    });
  });

  it('uses x-client-name when service name missing', () => {
    const hints = resolveCallerHints({
      'x-client-name': 'mobile-app',
      'user-agent': 'okhttp/4.0',
    });
    assert.equal(hints.name, 'mobile-app');
    assert.equal(hints.source, 'header');
    assert.equal(hints.uaFamily, 'sdk');
  });

  it('falls back to serviceName config', () => {
    const hints = resolveCallerHints(
      { 'user-agent': 'Mozilla/5.0 Chrome/120' },
      { serviceName: 'orders-worker' },
    );
    assert.deepEqual(hints, {
      name: 'orders-worker',
      source: 'config',
      uaFamily: 'browser',
    });
  });

  it('returns null name when nothing provided', () => {
    const hints = resolveCallerHints({});
    assert.equal(hints.name, null);
    assert.equal(hints.source, null);
    assert.equal(hints.uaFamily, 'unknown');
  });
});

describe('callerEdgeKey + display', () => {
  it('keys by name when present else ua family', () => {
    assert.equal(callerEdgeKey({ name: 'A', uaFamily: 'curl' }), 'name:a');
    assert.equal(callerEdgeKey({ name: null, uaFamily: 'curl' }), 'ua:curl');
    assert.equal(callerDisplayName({ name: 'billing' }), 'billing');
    assert.equal(callerDisplayName({ uaFamily: 'browser' }), 'Browser clients');
  });
});

describe('createSample caller field', () => {
  it('attaches caller from headers without breaking envelope shape', () => {
    const sample = createSample({
      method: 'GET',
      path: '/health',
      statusCode: 200,
      latencyMs: 1,
      requestHeaders: {
        'x-service-name': 'checkout',
        'user-agent': 'curl/8.0',
      },
      timestamp: '2026-01-15T12:00:00.000Z',
    });
    assert.deepEqual(sample.caller, {
      name: 'checkout',
      source: 'header',
      uaFamily: 'curl',
    });
  });

  it('two different x-service-name values produce distinct edge keys', () => {
    const a = createSample({
      method: 'GET',
      path: '/x',
      statusCode: 200,
      latencyMs: 1,
      requestHeaders: { 'x-service-name': 'svc-a' },
    });
    const b = createSample({
      method: 'GET',
      path: '/x',
      statusCode: 200,
      latencyMs: 1,
      requestHeaders: { 'x-service-name': 'svc-b' },
    });
    assert.notEqual(callerEdgeKey(a.caller), callerEdgeKey(b.caller));
  });
});
