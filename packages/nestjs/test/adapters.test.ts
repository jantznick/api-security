import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  Body,
  Controller,
  Get,
  INestApplication,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ApiGlimpseModule } from '../dist/index.js';

type Envelope = { samples?: Array<Record<string, unknown>> };

async function withNestApp(
  adapter: 'express' | 'fastify',
  run: (ctx: {
    app: INestApplication;
    request: (
      method: string,
      path: string,
      opts?: { headers?: Record<string, string>; body?: string },
    ) => Promise<{
      res: Response;
      text: string;
      envelope: Envelope;
      sample: Record<string, unknown>;
    }>;
  }) => Promise<void>,
) {
  const envelopes: Envelope[] = [];
  let pending: { resolve: (body: Envelope) => void } | null = null;

  const collector = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Envelope;
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

  await new Promise<void>((resolve) =>
    collector.listen(0, '127.0.0.1', () => resolve()),
  );
  const collectorAddr = collector.address();
  const collectorPort =
    typeof collectorAddr === 'object' && collectorAddr ? collectorAddr.port : 0;

  @Controller()
  class TestController {
    @Get('/health')
    health() {
      return { status: 'ok' };
    }

    @Get('/api/users/:id')
    getUser(@Param('id') id: string) {
      return { user: { id, email: 'alice@example.com' } };
    }

    @Post('/api/users')
    createUser(@Body() body: Record<string, unknown>) {
      return { user: { id: 1, ...(body || {}) } };
    }
  }

  @Module({
    imports: [
      ApiGlimpseModule.forRoot({
        agentUrl: `http://127.0.0.1:${collectorPort}`,
        apiKey: 'ask_test',
        sampleRate: 1,
        flushIntervalMs: 40,
        maxBatchSize: 1,
        requestTimeoutMs: 1000,
        serviceName: 'nestjs-test',
      }),
    ],
    controllers: [TestController],
  })
  class TestModule {}

  const app =
    adapter === 'fastify'
      ? await NestFactory.create(TestModule, new FastifyAdapter(), {
          logger: false,
        })
      : await NestFactory.create(TestModule, { logger: false });

  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  function waitForEnvelope(timeoutMs = 3000): Promise<Envelope> {
    return new Promise((resolve, reject) => {
      if (envelopes.length > 0) {
        resolve(envelopes.shift() as Envelope);
        return;
      }
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

  async function request(
    method: string,
    path: string,
    { headers = {}, body }: { headers?: Record<string, string>; body?: string } = {},
  ) {
    const envelopePromise = waitForEnvelope();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body,
    });
    const text = await res.text();
    const envelope = await envelopePromise;
    return { res, text, envelope, sample: envelope.samples?.[0] || {} };
  }

  try {
    await run({ app, request });
  } finally {
    await app.close();
    await new Promise<void>((resolve) => collector.close(() => resolve()));
  }
}

describe('@apiglimpse/nestjs Express adapter', () => {
  it('boots and samples GET JSON responses', async () => {
    await withNestApp('express', async ({ request }) => {
      const { res, sample } = await request('GET', '/api/users/7');
      assert.equal(res.status, 200);
      assert.equal(sample.method, 'GET');
      assert.equal(sample.path, '/api/users/7');
      assert.equal(sample.statusCode, 200);
      assert.ok((sample.latencyMs as number) >= 0);
      assert.equal(sample.responseBodyCaptured, true);
      const shape = sample.response as {
        bodyShape?: {
          type?: string;
          properties?: Record<
            string,
            { sample?: unknown; properties?: Record<string, { sample?: unknown }> }
          >;
        };
      };
      assert.equal(shape.bodyShape?.type, 'object');
      assert.equal(
        shape.bodyShape?.properties?.user?.properties?.email?.sample,
        'alice@example.com',
      );
    });
  });

  it('captures POST request body shapes', async () => {
    await withNestApp('express', async ({ request }) => {
      const { res, sample } = await request('POST', '/api/users', {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'bob@example.com', name: 'Bob' }),
      });
      assert.equal(res.status, 201);
      assert.equal(sample.method, 'POST');
      assert.equal(sample.path, '/api/users');
      const reqShape = sample.request as {
        bodyShape?: { properties?: Record<string, { sample?: unknown }> };
      };
      assert.equal(reqShape.bodyShape?.properties?.email?.sample, 'bob@example.com');
    });
  });
});

describe('@apiglimpse/nestjs Fastify adapter', () => {
  it('boots and samples via Fastify plugin reuse', async () => {
    await withNestApp('fastify', async ({ request }) => {
      const { res, sample } = await request('GET', '/health');
      assert.equal(res.status, 200);
      assert.equal(sample.method, 'GET');
      assert.equal(sample.path, '/health');
      assert.equal(sample.statusCode, 200);
      assert.equal(sample.responseBodyCaptured, true);
      const shape = sample.response as {
        bodyShape?: { properties?: Record<string, { sample?: unknown }> };
      };
      assert.equal(shape.bodyShape?.properties?.status?.sample, 'ok');
    });
  });

  it('samples parameterized routes', async () => {
    await withNestApp('fastify', async ({ request }) => {
      const { res, sample } = await request('GET', '/api/users/42');
      assert.equal(res.status, 200);
      assert.equal(sample.path, '/api/users/42');
      const shape = sample.response as {
        bodyShape?: {
          properties?: Record<
            string,
            { properties?: Record<string, { sample?: unknown }> }
          >;
        };
      };
      assert.equal(shape.bodyShape?.properties?.user?.properties?.id?.sample, '42');
    });
  });
});
