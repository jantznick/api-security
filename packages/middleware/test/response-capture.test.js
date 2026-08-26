import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { apiSensor } from '../src/index.js';

/**
 * Spin up an Express app + mock collector; return helpers to await the next
 * posted envelope sample.
 */
async function withApp(routes, run) {
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
          pending.resolve(body);
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

  const app = express();
  app.use(express.json());
  app.use(
    apiSensor({
      agentUrl: `http://127.0.0.1:${collectorPort}`,
      apiKey: 'ask_test',
      sampleRate: 1,
      flushIntervalMs: 40,
      maxBatchSize: 1,
      requestTimeoutMs: 1000,
    }),
  );
  routes(app);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  function waitForEnvelope(timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending = null;
        reject(new Error('timeout waiting for collector envelope'));
      }, timeoutMs);
      pending = {
        resolve: (body) => {
          clearTimeout(timer);
          resolve(body);
        },
      };
    });
  }

  async function request(method, path, { headers = {}, body } = {}) {
    const envelopePromise = waitForEnvelope();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body,
    });
    const text = await res.text();
    const envelope = await envelopePromise;
    return { res, text, envelope, sample: envelope.samples?.[0] };
  }

  try {
    await run({ request, envelopes, port });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => collector.close(resolve));
  }
}

describe('Express apiSensor response capture', () => {
  it('captures JSON via res.json into envelope bodyShape', async () => {
    await withApp(
      (app) => {
        app.get('/json', (_req, res) => {
          res.status(200).json({ id: '1', email: 'a@b.co' });
        });
      },
      async ({ request }) => {
        const { res, sample } = await request('GET', '/json');
        assert.equal(res.status, 200);
        assert.equal(sample.responseBodyCaptured, true);
        assert.equal(sample.response.bodyShape?.type, 'object');
        assert.equal(sample.response.bodyShape?.properties?.id?.sample, '1');
        assert.equal(sample.response.bodyShape?.properties?.email?.sample, 'a@b.co');
        assert.ok(String(sample.response.contentType || '').includes('application/json'));
      },
    );
  });

  it('captures stringified JSON via res.send', async () => {
    await withApp(
      (app) => {
        app.get('/send-json', (_req, res) => {
          res.type('json').send(JSON.stringify({ ok: true, n: 2 }));
        });
      },
      async ({ request }) => {
        const { res, sample } = await request('GET', '/send-json');
        assert.equal(res.status, 200);
        assert.equal(sample.responseBodyCaptured, true);
        assert.equal(sample.response.bodyShape?.properties?.ok?.sample, true);
        assert.equal(sample.response.bodyShape?.properties?.n?.sample, 2);
      },
    );
  });

  it('captures JSON written via res.end when Content-Type is JSON', async () => {
    await withApp(
      (app) => {
        app.get('/end-json', (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end('{"via":"end"}');
        });
      },
      async ({ request }) => {
        const { res, sample } = await request('GET', '/end-json');
        assert.equal(res.status, 200);
        assert.equal(sample.responseBodyCaptured, true);
        assert.equal(sample.response.bodyShape?.properties?.via?.sample, 'end');
      },
    );
  });

  it('captures JSON Buffer via res.end when Content-Type is JSON', async () => {
    await withApp(
      (app) => {
        app.get('/end-buf', (_req, res) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(Buffer.from('{"buf":true}', 'utf8'));
        });
      },
      async ({ request }) => {
        const { sample } = await request('GET', '/end-buf');
        assert.equal(sample.responseBodyCaptured, true);
        assert.equal(sample.response.bodyShape?.properties?.buf?.sample, true);
      },
    );
  });

  it('empty body → responseBodyCaptured false, bodyShape null', async () => {
    await withApp(
      (app) => {
        app.get('/empty', (_req, res) => {
          res.status(204).end();
        });
      },
      async ({ request }) => {
        const { res, sample } = await request('GET', '/empty');
        assert.equal(res.status, 204);
        assert.equal(sample.responseBodyCaptured, false);
        assert.equal(sample.response.bodyShape, null);
      },
    );
  });

  it('skips binary Buffer responses', async () => {
    await withApp(
      (app) => {
        app.get('/bin', (_req, res) => {
          res.setHeader('Content-Type', 'application/octet-stream');
          res.send(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        });
      },
      async ({ request }) => {
        const { res, sample } = await request('GET', '/bin');
        assert.equal(res.status, 200);
        assert.equal(sample.responseBodyCaptured, false);
        assert.equal(sample.response.bodyShape, null);
      },
    );
  });

  it('skips oversized JSON via res.end (large body cap)', async () => {
    const big = `{"x":"${'a'.repeat(70 * 1024)}"}`;
    await withApp(
      (app) => {
        app.get('/big', (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(big);
        });
      },
      async ({ request }) => {
        const { res, sample } = await request('GET', '/big');
        assert.equal(res.status, 200);
        assert.equal(sample.responseBodyCaptured, false);
        assert.equal(sample.response.bodyShape, null);
      },
    );
  });

  it('fail-open: app still responds when collector is down', async () => {
    const app = express();
    app.use(
      apiSensor({
        agentUrl: 'http://127.0.0.1:1',
        apiKey: 'ask_x',
        sampleRate: 1,
        flushIntervalMs: 30,
        maxBatchSize: 1,
        requestTimeoutMs: 50,
      }),
    );
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: 'ok' });
      await new Promise((r) => setTimeout(r, 80));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
