import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { createSampler, tryParseJsonBody, DEFAULTS } from './sampler.js';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/** Hard ceiling for buffering a request body to forward (not for shaping). */
const DEFAULT_MAX_FORWARD_BYTES = 10 * 1024 * 1024;

/**
 * @param {object} [options]
 * @param {string} options.upstream - Upstream app base URL (e.g. http://app:3000)
 * @param {number} [options.listenPort]
 * @param {string} [options.listenHost]
 * @param {string} [options.agentUrl]
 * @param {string} [options.apiKey]
 * @param {number} [options.sampleRate]
 * @param {number} [options.maxBodyBytes] - Cap for JSON shape sampling
 * @param {number} [options.maxForwardBodyBytes] - Cap for buffering request bodies to forward
 */
export function createGatewayProxy(options = {}) {
  const upstreamRaw = options.upstream || process.env.API_SENSOR_UPSTREAM || '';
  if (!upstreamRaw) {
    throw new Error('API_SENSOR_UPSTREAM (or options.upstream) is required');
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(upstreamRaw);
  } catch {
    throw new Error(`Invalid upstream URL: ${upstreamRaw}`);
  }

  const listenPort = Number(
    options.listenPort ?? process.env.API_SENSOR_PROXY_PORT ?? 9080,
  );
  const listenHost = options.listenHost || process.env.API_SENSOR_PROXY_HOST || '0.0.0.0';
  const maxForwardBodyBytes = Number(
    options.maxForwardBodyBytes ??
      process.env.API_SENSOR_MAX_FORWARD_BYTES ??
      DEFAULT_MAX_FORWARD_BYTES,
  );

  const sampler = createSampler({
    agentUrl:
      options.agentUrl ||
      process.env.API_SENSOR_AGENT_URL ||
      DEFAULTS.agentUrl,
    apiKey: options.apiKey || process.env.API_SENSOR_KEY || DEFAULTS.apiKey,
    sampleRate:
      options.sampleRate != null
        ? Number(options.sampleRate)
        : process.env.API_SENSOR_SAMPLE_RATE != null
          ? Number(process.env.API_SENSOR_SAMPLE_RATE)
          : DEFAULTS.sampleRate,
    maxBodyBytes:
      options.maxBodyBytes != null
        ? Number(options.maxBodyBytes)
        : process.env.API_SENSOR_MAX_BODY_BYTES != null
          ? Number(process.env.API_SENSOR_MAX_BODY_BYTES)
          : DEFAULTS.maxBodyBytes,
    flushIntervalMs: options.flushIntervalMs,
    maxBatchSize: options.maxBatchSize,
    maxBufferSize: options.maxBufferSize,
    requestTimeoutMs: options.requestTimeoutMs,
    circuitFailureThreshold: options.circuitFailureThreshold,
    circuitOpenMs: options.circuitOpenMs,
  });

  const maxBody = sampler.cfg.maxBodyBytes;
  const isHttpsUpstream = upstreamUrl.protocol === 'https:';
  const transport = isHttpsUpstream ? https : http;
  const upstreamPort = upstreamUrl.port || (isHttpsUpstream ? 443 : 80);

  function filterRequestHeaders(incoming) {
    const out = {};
    for (const [key, value] of Object.entries(incoming || {})) {
      if (HOP_BY_HOP.has(key.toLowerCase())) continue;
      out[key] = value;
    }
    out.host = upstreamUrl.host;
    return out;
  }

  function filterResponseHeaders(incoming) {
    const out = { ...incoming };
    for (const h of HOP_BY_HOP) {
      delete out[h];
    }
    return out;
  }

  function readBody(stream, limit) {
    return new Promise((resolve) => {
      const chunks = [];
      let total = 0;
      let truncated = false;

      stream.on('data', (chunk) => {
        total += chunk.length;
        if (!truncated && total <= limit) {
          chunks.push(chunk);
        } else {
          truncated = true;
        }
      });
      stream.on('end', () => {
        resolve({ buf: Buffer.concat(chunks), truncated, total });
      });
      stream.on('error', () => {
        resolve({ buf: Buffer.concat(chunks), truncated: true, total });
      });
    });
  }

  function sampleRequest({
    method,
    pathOnly,
    statusCode,
    start,
    requestHeaders,
    responseHeaders,
    requestBodyBuf,
    requestTruncatedForShape,
    responseBodyBuf,
    responseOverCap,
  }) {
    try {
      const reqCt = requestHeaders['content-type'] || requestHeaders['Content-Type'];
      const resCt = responseHeaders['content-type'] || responseHeaders['Content-Type'];

      const requestBody = !requestTruncatedForShape
        ? tryParseJsonBody(requestBodyBuf, reqCt, maxBody)
        : undefined;
      const responseBody = !responseOverCap
        ? tryParseJsonBody(responseBodyBuf, resCt, maxBody)
        : undefined;

      sampler.enqueue({
        method,
        path: pathOnly,
        statusCode,
        latencyMs: Date.now() - start,
        requestHeaders,
        responseHeaders,
        requestBody,
        responseBody,
      });
    } catch {
      /* fail-open */
    }
  }

  const server = http.createServer(async (clientReq, clientRes) => {
    const start = Date.now();
    const pathOnly = (clientReq.url || '/').split('?')[0] || '/';
    const method = clientReq.method || 'GET';
    const requestHeaders = clientReq.headers || {};

    let forwardBuf = Buffer.alloc(0);
    let shapeReqBuf = Buffer.alloc(0);
    let requestTruncatedForShape = false;

    try {
      const inbound = await readBody(clientReq, maxForwardBodyBytes);
      if (inbound.truncated) {
        try {
          if (!clientRes.headersSent) {
            clientRes.writeHead(413, { 'content-type': 'application/json' });
          }
          clientRes.end(JSON.stringify({ error: 'request_entity_too_large' }));
        } catch {
          /* ignore */
        }
        return;
      }
      forwardBuf = inbound.buf;
      if (forwardBuf.length > maxBody) {
        requestTruncatedForShape = true;
        shapeReqBuf = forwardBuf.subarray(0, maxBody);
      } else {
        shapeReqBuf = forwardBuf;
      }
    } catch {
      /* empty body */
    }

    const headers = filterRequestHeaders(requestHeaders);
    if (forwardBuf.length > 0) {
      headers['content-length'] = String(forwardBuf.length);
      delete headers['transfer-encoding'];
    }

    const proxyReq = transport.request(
      {
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamPort,
        path: clientReq.url || '/',
        method,
        headers,
        timeout: 60_000,
      },
      (proxyRes) => {
        const outHeaders = filterResponseHeaders(proxyRes.headers);
        if (!clientRes.headersSent) {
          clientRes.writeHead(proxyRes.statusCode || 502, outHeaders);
        }

        const resChunks = [];
        let resTotal = 0;
        let resOverCap = false;

        proxyRes.on('data', (chunk) => {
          resTotal += chunk.length;
          if (!resOverCap && resTotal <= maxBody) {
            resChunks.push(chunk);
          } else if (resTotal > maxBody) {
            resOverCap = true;
          }
          if (!clientRes.writableEnded) {
            clientRes.write(chunk);
          }
        });

        proxyRes.on('end', () => {
          try {
            clientRes.end();
          } catch {
            /* ignore */
          }

          sampleRequest({
            method,
            pathOnly,
            statusCode: proxyRes.statusCode || 0,
            start,
            requestHeaders,
            responseHeaders: proxyRes.headers || {},
            requestBodyBuf: shapeReqBuf,
            requestTruncatedForShape,
            responseBodyBuf: Buffer.concat(resChunks),
            responseOverCap: resOverCap,
          });
        });

        proxyRes.on('error', () => {
          try {
            if (!clientRes.writableEnded) clientRes.end();
          } catch {
            /* ignore */
          }
        });
      },
    );

    proxyReq.on('error', (err) => {
      try {
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'content-type': 'application/json' });
        }
        if (!clientRes.writableEnded) {
          clientRes.end(
            JSON.stringify({
              error: 'upstream_unreachable',
              message: err.message,
            }),
          );
        }
      } catch {
        /* ignore */
      }

      sampleRequest({
        method,
        pathOnly,
        statusCode: 502,
        start,
        requestHeaders,
        responseHeaders: {},
        requestBodyBuf: shapeReqBuf,
        requestTruncatedForShape,
        responseBodyBuf: Buffer.alloc(0),
        responseOverCap: false,
      });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('upstream timeout'));
    });

    if (forwardBuf.length > 0) {
      proxyReq.write(forwardBuf);
    }
    proxyReq.end();
  });

  server.on('clientError', (_err, socket) => {
    try {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    } catch {
      /* ignore */
    }
  });

  function listen() {
    sampler.start();
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(listenPort, listenHost, () => {
        server.removeListener('error', reject);
        const addr = server.address();
        resolve({
          port: typeof addr === 'object' && addr ? addr.port : listenPort,
          host: listenHost,
          upstream: upstreamUrl.href,
          agentUrl: sampler.cfg.agentUrl,
        });
      });
    });
  }

  async function close() {
    await sampler.stop();
    return new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  return {
    server,
    sampler,
    listen,
    close,
    listenPort,
    listenHost,
    upstreamUrl,
  };
}

export { createSampler, tryParseJsonBody, DEFAULTS } from './sampler.js';
export default createGatewayProxy;
