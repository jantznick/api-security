import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Fastify from 'fastify';
import { apiSensor } from '../src/index.js';

async function withApp(registerRoutes, run) {
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

  const app = Fastify({ logger: false });
  await app.register(
    apiSensor({
      agentUrl: `http://127.0.0.1:${collectorPort}`,
      apiKey: 'ask_test',
      sampleRate: 1,
      flushIntervalMs: 40,
      maxBatchSize: 1,
      requestTimeoutMs: 1000,
    }),
  );
  registerRoutes(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

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

  async function request(method, path, opts = {}) {
    const envelopePromise = waitForEnvelope();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      ...opts,
    });
    const text = await res.text();
    const envelope = await envelopePromise;
    return { res, text, envelope, sample: envelope.samples?.[0] };
  }

  try {
    await run({ request, app, envelopes });
  } finally {
    await app.close();
    await new Promise((resolve) => collector.close(resolve));
  }
}

describe('Fastify apiSensor onSend response capture', () => {
  it('captures object JSON from reply.send into envelope bodyShape', async () => {
    await withApp(
      (app) => {
        app.get('/json', async () => ({ id: '1', email: 'a@b.co' }));
      },
      async ({ request }) => {
        const { res, sample } = await request('GET', '/json');
        assert.equal(res.status, 200);
        assert.equal(sample.responseBodyCaptured, true);
        assert.equal(sample.response.bodyShape?.type, 'object');
        assert.equal(sample.response.bodyShape?.properties?.id?.sample, '1');
        assert.equal(sample.response.bodyShape?.properties?.email?.sample, 'a@b.co');
      },
    );
  });

  it('captures stringified JSON payload from onSend', async () => {
    await withApp(
      (app) => {
        app.get('/raw-json', async (_req, reply) => {
          reply.type('application/json');
          return JSON.stringify({ ok: true, n: 3 });
        });
      },
      async ({ request }) => {
        const { sample } = await request('GET', '/raw-json');
        assert.equal(sample.responseBodyCaptured, true);
        assert.equal(sample.response.bodyShape?.properties?.ok?.sample, true);
        assert.equal(sample.response.bodyShape?.properties?.n?.sample, 3);
      },
    );
  });

  it('captures JSON Buffer when Content-Type is JSON', async () => {
    await withApp(
      (app) => {
        app.get('/buf-json', async (_req, reply) => {
          reply.type('application/json');
          return Buffer.from('{"via":"buffer"}', 'utf8');
        });
      },
      async ({ request }) => {
        const { sample } = await request('GET', '/buf-json');
        assert.equal(sample.responseBodyCaptured, true);
        assert.equal(sample.response.bodyShape?.properties?.via?.sample, 'buffer');
      },
    );
  });

  it('empty / nullish body → responseBodyCaptured false', async () => {
    await withApp(
      (app) => {
        app.get('/empty', async (_req, reply) => {
          reply.code(204);
          return null;
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

  it('skips binary Buffer with non-JSON content type', async () => {
    await withApp(
      (app) => {
        app.get('/bin', async (_req, reply) => {
          reply.type('application/octet-stream');
          return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        });
      },
      async ({ request }) => {
        const { sample } = await request('GET', '/bin');
        assert.equal(sample.responseBodyCaptured, false);
        assert.equal(sample.response.bodyShape, null);
      },
    );
  });

  it('fail-open when collector is unreachable', async () => {
    const app = Fastify({ logger: false });
    await app.register(
      apiSensor({
        agentUrl: 'http://127.0.0.1:1',
        apiKey: 'ask_x',
        sampleRate: 1,
        flushIntervalMs: 30,
        maxBatchSize: 1,
        requestTimeoutMs: 50,
      }),
    );
    app.get('/health', async () => ({ status: 'ok' }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: 'ok' });
      await new Promise((r) => setTimeout(r, 80));
    } finally {
      await app.close();
    }
  });
});
