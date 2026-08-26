import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyUserAgent,
  resolveCallerHints,
  callerDisplayName,
} from '../src/caller.js';

describe('caller hints (SF3)', () => {
  it('prefers x-service-name over user-agent', () => {
    const caller = resolveCallerHints({
      headers: {
        'x-service-name': 'orders-svc',
        'user-agent': 'curl/8.0',
      },
    });
    assert.equal(caller.serviceName, 'orders-svc');
    assert.equal(caller.key, 'svc:orders-svc');
    assert.equal(caller.userAgentFamily, 'curl');
  });

  it('uses API_SENSOR_SERVICE_NAME / serviceName config when headers absent', () => {
    const caller = resolveCallerHints({
      headers: { 'user-agent': 'Mozilla/5.0' },
      serviceName: 'billing-api',
    });
    assert.equal(caller.key, 'svc:billing-api');
    assert.equal(caller.label, 'billing-api');
  });

  it('falls back to ua family without inventing a service edge key', () => {
    const caller = resolveCallerHints({
      headers: { 'user-agent': 'curl/8.0' },
    });
    assert.equal(caller.serviceName, null);
    assert.equal(caller.key, 'ua:curl');
    assert.equal(classifyUserAgent('python-requests/2.31'), 'sdk');
    assert.equal(callerDisplayName(caller), 'ua:curl');
  });
});
