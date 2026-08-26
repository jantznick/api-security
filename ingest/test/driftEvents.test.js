import assert from 'node:assert/strict';
import { isAuthRegression, normalizeAuthModes, resolveWebhookUrl } from '../lib/driftEvents.js';

assert.deepEqual(normalizeAuthModes(['Bearer', 'none', 'bearer']), ['bearer', 'none']);
assert.equal(
  isAuthRegression({ prevAuth: ['bearer'], sampleAuth: ['none'], hitCount: 3 }),
  true,
);
assert.equal(
  isAuthRegression({ prevAuth: ['bearer'], sampleAuth: ['none'], hitCount: 0 }),
  false,
);
assert.equal(
  isAuthRegression({ prevAuth: ['none'], sampleAuth: ['none'], hitCount: 5 }),
  false,
);
assert.equal(
  isAuthRegression({ prevAuth: ['cookie'], sampleAuth: ['none', 'bearer'], hitCount: 2 }),
  false,
);
assert.equal(
  resolveWebhookUrl({ webhookUrl: 'https://svc.example/hook', project: { webhookUrl: 'https://proj' } }),
  'https://svc.example/hook',
);
assert.equal(
  resolveWebhookUrl({ webhookUrl: null, project: { webhookUrl: 'https://proj.example' } }),
  'https://proj.example',
);
assert.equal(resolveWebhookUrl({ webhookUrl: '', project: { webhookUrl: '' } }), null);

console.log('driftEvents.test.js: ok');
