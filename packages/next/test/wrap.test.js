import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiSensor, withApiSensor } from '../src/index.js';

/**
 * Mock collector + helpers.
 */
async function withCollector(run) {
  /** @type {any[]} */
  const envelopes = [];
  let pending = null;

  const collector = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        envelopes.push(body);
        if (pending) {
          pending.resolve({ body, headers: req.headers });
          pending = null;
        }
      } catch {
        /* ignore */
      }
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: 1 }));
    });
  });

  await new Promise((resolve) => collector.listen(0, '127.0.0.1', resolve));
  const { port: collectorPort } = collector.address();

  function waitForEnvelope(timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending = null;
        reject(new Error('timeout waiting for collector envelope'));
      }, timeoutMs);
      pending = {
        resolve: (payload) => {
          clearTimeout(timer);
          resolve(payload);
        },
      };
    });
  }

  const sensor = createApiSensor({
    agentUrl: `http://127.0.0.1:${collectorPort}`,
    apiKey: 'ask_test',
    sampleRate: 1,
    flushIntervalMs: 40,
    maxBatchSize: 1,
    requestTimeoutMs: 1000,
  });

  try {
    await run({ sensor, waitForEnvelope, envelopes, collectorPort });
  } finally {
    await new Promise((resolve) => collector.close(resolve));
  }
}

describe('@apiglimpse/next Route Handler wrap', () => {
  it('captures GET JSON response into envelope bodyShape', async () => {
    await withCollector(async ({ sensor, waitForEnvelope }) => {
      const handler = sensor.wrap(async () =>
        Response.json({ id: '1', email: 'a@b.co' }),
      );

      const envelopePromise = waitForEnvelope();
      const req = new Request('http://localhost/api/users', { method: 'GET' });
      const res = await handler(req);
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.id, '1');

      const { body: envelope, headers } = await envelopePromise;
      assert.equal(envelope.version, 1);
      assert.equal(headers['x-api-key'], 'ask_test');
      const sample = envelope.samples[0];
      assert.equal(sample.method, 'GET');
      assert.equal(sample.path, '/api/users');
      assert.equal(sample.statusCode, 200);
      assert.equal(sample.responseBodyCaptured, true);
      assert.equal(sample.response.bodyShape?.type, 'object');
      assert.equal(sample.response.bodyShape?.properties?.id?.sample, '1');
      assert.equal(sample.response.bodyShape?.properties?.email?.sample, 'a@b.co');
    });
  });

  it('clones request so handler can still read JSON body', async () => {
    await withCollector(async ({ sensor, waitForEnvelope }) => {
      const handler = sensor.wrap(async (request) => {
        const body = await request.json();
        return Response.json({ ok: true, name: body.name }, { status: 201 });
      });

      const envelopePromise = waitForEnvelope();
      const req = new Request('http://localhost/api/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer demo-token',
        },
        body: JSON.stringify({ name: 'Ada', password: 'secret' }),
      });
      const res = await handler(req);
      assert.equal(res.status, 201);
      const payload = await res.json();
      assert.equal(payload.name, 'Ada');

      const { body: envelope } = await envelopePromise;
      const sample = envelope.samples[0];
      assert.equal(sample.method, 'POST');
      assert.equal(sample.statusCode, 201);
      assert.equal(sample.authObserved, 'bearer');
      assert.equal(sample.request.bodyShape?.type, 'object');
      assert.equal(sample.request.bodyShape?.properties?.name?.sample, 'Ada');
      // password shaped/redacted by shared — present as a property key
      assert.ok(sample.request.bodyShape?.properties?.password);
      assert.equal(sample.responseBodyCaptured, true);
    });
  });

  it('stays fail-open when collector is unreachable', async () => {
    const sensor = createApiSensor({
      agentUrl: 'http://127.0.0.1:9',
      apiKey: 'ask_test',
      sampleRate: 1,
      flushIntervalMs: 20,
      maxBatchSize: 1,
      requestTimeoutMs: 100,
      circuitFailureThreshold: 1,
      circuitOpenMs: 50,
    });

    const handler = sensor.wrap(async () => Response.json({ ok: true }));
    const res = await handler(new Request('http://localhost/health'));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    // Give flush a moment to fail; response path must already have succeeded.
    await new Promise((r) => setTimeout(r, 80));
  });

  it('withApiSensor wraps like createApiSensor().wrap', async () => {
    await withCollector(async ({ waitForEnvelope, collectorPort }) => {
      const handler = withApiSensor(
        async () => Response.json({ status: 'ok' }),
        {
          agentUrl: `http://127.0.0.1:${collectorPort}`,
          apiKey: 'ask_test',
          sampleRate: 1,
          flushIntervalMs: 40,
          maxBatchSize: 1,
        },
      );

      const envelopePromise = waitForEnvelope();
      const res = await handler(new Request('http://localhost/health'));
      assert.equal(res.status, 200);
      const { body: envelope } = await envelopePromise;
      assert.equal(envelope.samples[0].path, '/health');
      assert.equal(envelope.samples[0].responseBodyCaptured, true);
    });
  });

  it('skips non-JSON / empty response body capture', async () => {
    await withCollector(async ({ sensor, waitForEnvelope }) => {
      const handler = sensor.wrap(
        async () => new Response('plain', { status: 200, headers: { 'content-type': 'text/plain' } }),
      );

      const envelopePromise = waitForEnvelope();
      const res = await handler(new Request('http://localhost/plain'));
      assert.equal(await res.text(), 'plain');

      const { body: envelope } = await envelopePromise;
      const sample = envelope.samples[0];
      assert.equal(sample.responseBodyCaptured, false);
      assert.equal(sample.response.bodyShape, null);
    });
  });
});
