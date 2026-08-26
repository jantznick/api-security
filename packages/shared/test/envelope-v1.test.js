import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSample,
  createEnvelope,
  validateEnvelope,
  redactHeaders,
  shapeBody,
  ENVELOPE_VERSION,
} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

describe('envelope v1 golden fixtures', () => {
  it('validateEnvelope accepts envelope-v1-minimal.json', () => {
    const minimal = loadFixture('envelope-v1-minimal.json');
    assert.equal(minimal.version, ENVELOPE_VERSION);
    assert.deepEqual(validateEnvelope(minimal), { ok: true });
  });

  it('validateEnvelope accepts envelope built around sample-shaped.json', () => {
    const sample = loadFixture('sample-shaped.json');
    const envelope = {
      version: 1,
      apiKey: 'ask_test_key_fixture',
      samples: [sample],
      sentAt: '2026-01-15T12:00:01.000Z',
    };
    assert.deepEqual(validateEnvelope(envelope), { ok: true });
  });

  it('validateEnvelope rejects wrong version and missing samples', () => {
    assert.equal(validateEnvelope({ version: 2, samples: [] }).ok, false);
    assert.equal(validateEnvelope({ version: 1 }).ok, false);
    assert.equal(validateEnvelope(null).ok, false);
  });
});

describe('createSample + redaction stable shapes', () => {
  it('matches sample-shaped.json for known inputs', () => {
    const expected = loadFixture('sample-shaped.json');
    const actual = createSample({
      method: 'POST',
      path: '/api/users',
      statusCode: 201,
      latencyMs: 42,
      requestHeaders: {
        'content-type': 'application/json',
        authorization: 'Bearer secret-token',
        'x-request-id': 'req-abc-123',
      },
      responseHeaders: {
        'content-type': 'application/json',
        'set-cookie': 'session=abc',
      },
      requestBody: {
        email: 'user@example.com',
        password: 'hunter2',
        profile: { name: 'Ada', age: 36 },
      },
      responseBody: {
        id: 'usr_01',
        email: 'user@example.com',
        token: 'should-redact',
      },
      authObserved: 'bearer',
      timestamp: '2026-01-15T12:00:00.000Z',
    });
    assert.deepEqual(actual, expected);
  });

  it('redactHeaders strips sensitive values', () => {
    const out = redactHeaders({
      Authorization: 'Bearer xyz',
      Cookie: 'a=1',
      'X-Request-Id': 'abc',
    });
    assert.equal(out.authorization, '[REDACTED]');
    assert.equal(out.cookie, '[REDACTED]');
    assert.equal(out['x-request-id'], 'abc');
  });

  it('shapeBody redacts password/token fields', () => {
    const shaped = shapeBody({ password: 'secret', token: 't', name: 'Ada' });
    assert.equal(shaped.type, 'object');
    assert.equal(shaped.properties.password.sample, '[REDACTED]');
    assert.equal(shaped.properties.token.sample, '[REDACTED]');
    assert.equal(shaped.properties.name.sample, 'Ada');
  });

  it('createEnvelope uses version 1 and samples array', () => {
    const sample = loadFixture('sample-shaped.json');
    const env = createEnvelope({ apiKey: 'ask_x', samples: [sample] });
    assert.equal(env.version, 1);
    assert.equal(env.apiKey, 'ask_x');
    assert.equal(env.samples.length, 1);
    assert.equal(typeof env.sentAt, 'string');
    assert.deepEqual(validateEnvelope(env), { ok: true });
  });

  it('includes responseBodyCaptured only when explicitly provided', () => {
    const without = createSample({
      method: 'GET',
      path: '/',
      statusCode: 200,
      latencyMs: 1,
      responseBody: { ok: true },
    });
    assert.equal('responseBodyCaptured' in without, false);

    const captured = createSample({
      method: 'GET',
      path: '/',
      statusCode: 200,
      latencyMs: 1,
      responseBody: { ok: true },
      responseBodyCaptured: true,
    });
    assert.equal(captured.responseBodyCaptured, true);
    assert.equal(captured.response.bodyShape?.type, 'object');

    const skipped = createSample({
      method: 'GET',
      path: '/',
      statusCode: 200,
      latencyMs: 1,
      responseBodyCaptured: false,
    });
    assert.equal(skipped.responseBodyCaptured, false);
    assert.equal(skipped.response.bodyShape, null);
  });
});
