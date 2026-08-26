import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSampler, tryParseJsonBody } from '../src/sampler.js';
import { createGatewayProxy } from '../src/index.js';

describe('tryParseJsonBody', () => {
  it('parses JSON when content-type is application/json', () => {
    const buf = Buffer.from(JSON.stringify({ email: 'a@b.com' }));
    const out = tryParseJsonBody(buf, 'application/json', 65536);
    assert.deepEqual(out, { email: 'a@b.com' });
  });

  it('returns undefined for oversized bodies', () => {
    const buf = Buffer.alloc(100, 0x61);
    assert.equal(tryParseJsonBody(buf, 'application/json', 50), undefined);
  });

  it('returns undefined for non-JSON binary', () => {
    const buf = Buffer.from([0x00, 0x01, 0xff]);
    assert.equal(tryParseJsonBody(buf, 'application/octet-stream', 65536), undefined);
  });
});

describe('createSampler circuit breaker', () => {
  it('opens after consecutive failures', () => {
    const s = createSampler({
      circuitFailureThreshold: 2,
      circuitOpenMs: 60_000,
      apiKey: 'ask_test',
      agentUrl: 'http://127.0.0.1:9',
    });
    assert.equal(s._circuitOpen(), false);
    s._recordFailure();
    assert.equal(s._circuitOpen(), false);
    s._recordFailure();
    assert.equal(s._circuitOpen(), true);
  });

  it('enqueue builds envelope-compatible samples via createSample', () => {
    const s = createSampler({ sampleRate: 1, apiKey: 'ask_x' });
    s.enqueue({
      method: 'GET',
      path: '/health',
      statusCode: 200,
      latencyMs: 3,
      requestHeaders: { 'content-type': 'application/json' },
      responseHeaders: { 'content-type': 'application/json' },
      requestBody: undefined,
      responseBody: { ok: true },
    });
    assert.equal(s._buffer.length, 1);
    const sample = s._buffer[0];
    assert.equal(sample.method, 'GET');
    assert.equal(sample.path, '/health');
    assert.equal(sample.statusCode, 200);
    assert.ok(sample.request);
    assert.ok(sample.response);
    assert.equal(sample.response.bodyShape?.type, 'object');
  });
});

describe('createGatewayProxy integration', () => {
  it('forwards HTTP and POSTs /v1/samples', async () => {
    const samplesReceived = [];

    const upstream = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ echo: body ? JSON.parse(body) : null, path: req.url }));
      });
    });
    await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
    const upstreamPort = upstream.address().port;

    const collector = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        assert.equal(req.url, '/v1/samples');
        assert.equal(req.method, 'POST');
        assert.equal(req.headers['x-api-key'], 'ask_test');
        const envelope = JSON.parse(body);
        assert.equal(envelope.version, 1);
        assert.ok(Array.isArray(envelope.samples));
        samplesReceived.push(...envelope.samples);
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ accepted: envelope.samples.length }));
      });
    });
    await new Promise((r) => collector.listen(0, '127.0.0.1', r));
    const collectorPort = collector.address().port;

    const proxy = createGatewayProxy({
      upstream: `http://127.0.0.1:${upstreamPort}`,
      agentUrl: `http://127.0.0.1:${collectorPort}`,
      apiKey: 'ask_test',
      listenHost: '127.0.0.1',
      listenPort: 0,
      sampleRate: 1,
      flushIntervalMs: 50,
      maxBatchSize: 1,
    });

    // listen() with port 0 — Node assigns ephemeral; override via server.listen
    await new Promise((resolve, reject) => {
      proxy.sampler.start();
      proxy.server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });
    const proxyPort = proxy.server.address().port;

    const payload = JSON.stringify({ user: 'nick' });
    const result = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: proxyPort,
          path: '/api/echo',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
            authorization: 'Bearer secret-token',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        },
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.echo, { user: 'nick' });

    // Force flush
    await proxy.sampler.flush();
    // Allow collector handler to finish
    await new Promise((r) => setTimeout(r, 50));

    assert.ok(samplesReceived.length >= 1, 'collector should receive samples');
    const sample = samplesReceived[0];
    assert.equal(sample.method, 'POST');
    assert.equal(sample.path, '/api/echo');
    assert.equal(sample.statusCode, 200);
    assert.equal(sample.authObserved, 'bearer');
    assert.equal(sample.request.headers.authorization, '[REDACTED]');
    assert.ok(sample.request.bodyShape);
    assert.ok(sample.response.bodyShape);

    await proxy.close();
    await new Promise((r) => collector.close(r));
    await new Promise((r) => upstream.close(r));
  });
});
