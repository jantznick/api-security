import { createEnvelope, createSample, resolveCallerHints } from '@apiglimpse/shared';

const DEFAULTS = {
  agentUrl: 'http://localhost:8080',
  apiKey: '',
  sampleRate: 1.0,
  flushIntervalMs: 1000,
  maxBatchSize: 50,
  maxBufferSize: 500,
  requestTimeoutMs: 2000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 15000,
  serviceName: process.env.API_SENSOR_SERVICE_NAME || '',
};

/** Max bytes we will attempt to parse from onSend string/Buffer payloads. */
const MAX_RESPONSE_CAPTURE_BYTES = 64 * 1024;

const kSkip = Symbol('apiglimpse.skip');
const kStart = Symbol('apiglimpse.start');
const kResponseBody = Symbol('apiglimpse.responseBody');

function isJsonContentType(contentType) {
  return String(contentType || '')
    .toLowerCase()
    .includes('application/json');
}

/**
 * Fastify plugin for API Glimpse: captures request/response metadata,
 * redacts secrets, buffers, and flushes async batches to the collector.
 *
 * Never awaits the collector on the request path. Errors are swallowed
 * so sampling stays off the critical path.
 *
 * @param {object} options
 * @param {string} [options.agentUrl]
 * @param {string} [options.apiKey]
 * @param {number} [options.sampleRate] 0–1
 * @returns {import('fastify').FastifyPluginAsync}
 */
export function apiSensor(options = {}) {
  const cfg = {
    ...DEFAULTS,
    agentUrl: process.env.API_SENSOR_AGENT_URL || DEFAULTS.agentUrl,
    apiKey: process.env.API_SENSOR_KEY || DEFAULTS.apiKey,
    sampleRate:
      process.env.API_SENSOR_SAMPLE_RATE != null
        ? Number(process.env.API_SENSOR_SAMPLE_RATE)
        : DEFAULTS.sampleRate,
    serviceName: process.env.API_SENSOR_SERVICE_NAME || DEFAULTS.serviceName,
    ...options,
  };

  const buffer = [];
  let flushing = false;
  let consecutiveFailures = 0;
  let circuitOpenUntil = 0;

  function shouldSample() {
    if (cfg.sampleRate >= 1) return true;
    if (cfg.sampleRate <= 0) return false;
    return Math.random() < cfg.sampleRate;
  }

  function circuitOpen() {
    return Date.now() < circuitOpenUntil;
  }

  function recordFailure() {
    consecutiveFailures += 1;
    if (consecutiveFailures >= cfg.circuitFailureThreshold) {
      circuitOpenUntil = Date.now() + cfg.circuitOpenMs;
      consecutiveFailures = 0;
    }
  }

  function recordSuccess() {
    consecutiveFailures = 0;
    circuitOpenUntil = 0;
  }

  function observeAuth(request) {
    try {
      const auth = request.headers?.authorization || request.headers?.Authorization;
      if (auth && /^Bearer\s+/i.test(String(auth))) return 'bearer';
      if (request.headers?.cookie) return 'cookie';
      return 'none';
    } catch {
      return 'none';
    }
  }

  function parseResponsePayload(payload, contentType) {
    if (payload === undefined || payload === null) return undefined;
    try {
      if (typeof payload === 'string') {
        if (!payload || Buffer.byteLength(payload, 'utf8') > MAX_RESPONSE_CAPTURE_BYTES) {
          return undefined;
        }
        try {
          const parsed = JSON.parse(payload);
          // JSON null is not a useful response shape for inventory
          return parsed === null ? undefined : parsed;
        } catch {
          return undefined;
        }
      }
      if (Buffer.isBuffer(payload)) {
        // Only attempt Buffer JSON when Content-Type is JSON; skip binary.
        if (!isJsonContentType(contentType)) return undefined;
        if (payload.length > MAX_RESPONSE_CAPTURE_BYTES) return undefined;
        try {
          return JSON.parse(payload.toString('utf8'));
        } catch {
          return undefined;
        }
      }
      if (typeof payload === 'object') {
        // Skip streams / readable-like payloads
        if (typeof payload.pipe === 'function') return undefined;
        return payload;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }

  async function flush() {
    if (flushing || buffer.length === 0) return;
    if (circuitOpen()) return;

    flushing = true;
    const batch = buffer.splice(0, cfg.maxBatchSize);
    try {
      const envelope = createEnvelope({ apiKey: cfg.apiKey, samples: batch });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

      const res = await fetch(`${cfg.agentUrl.replace(/\/$/, '')}/v1/samples`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': cfg.apiKey || '',
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok && res.status >= 500) {
        recordFailure();
        // drop batch — fail-open, do not retry forever
      } else if (!res.ok && res.status === 401) {
        // bad key — drop, do not trip circuit forever
      } else {
        recordSuccess();
      }
    } catch {
      recordFailure();
    } finally {
      flushing = false;
    }
  }

  const interval = setInterval(() => {
    flush().catch(() => {});
  }, cfg.flushIntervalMs);
  if (typeof interval.unref === 'function') interval.unref();

  async function apiSensorPlugin(fastify) {
    fastify.addHook('onRequest', async (request) => {
      try {
        if (!shouldSample()) {
          request[kSkip] = true;
          return;
        }
        request[kStart] = Date.now();
      } catch {
        request[kSkip] = true;
      }
    });

    fastify.addHook('onSend', async (request, reply, payload) => {
      try {
        if (request[kSkip]) return payload;
        if (request[kResponseBody] === undefined) {
          const ct =
            reply.getHeader?.('content-type') ||
            reply.getHeader?.('Content-Type') ||
            '';
          request[kResponseBody] = parseResponsePayload(payload, ct);
        }
      } catch {
        /* fail-open */
      }
      return payload;
    });

    fastify.addHook('onResponse', async (request, reply) => {
      try {
        if (request[kSkip]) return;

        if (buffer.length >= cfg.maxBufferSize) {
          buffer.shift();
        }

        const requestBody =
          request.body && typeof request.body === 'object' ? request.body : undefined;

        const rawResponseBody = request[kResponseBody];
        // null / undefined → no JSON shape (empty 204, Fastify null payload, etc.)
        const responseBodyCaptured = rawResponseBody !== undefined && rawResponseBody !== null;
        const responseBody = responseBodyCaptured ? rawResponseBody : undefined;

        const sample = createSample({
          method: request.method,
          path: (request.url || '/').split('?')[0] || '/',
          statusCode: reply.statusCode,
          latencyMs: Date.now() - (request[kStart] || Date.now()),
          requestHeaders: request.headers || {},
          responseHeaders: reply.getHeaders?.() || {},
          requestBody,
          responseBody,
          responseBodyCaptured,
          caller: resolveCallerHints({
            headers: request.headers || {},
            serviceName: cfg.serviceName || null,
          }),
          authObserved: observeAuth(request),
        });
        buffer.push(sample);

        if (buffer.length >= cfg.maxBatchSize) {
          flush().catch(() => {});
        }
      } catch {
        /* fail-open: never break the app */
      }
    });
  }

  // Encapsulation-friendly Fastify plugin metadata (same role as fastify-plugin)
  apiSensorPlugin[Symbol.for('skip-override')] = true;
  apiSensorPlugin[Symbol.for('fastify.display-name')] = '@apiglimpse/fastify';

  return apiSensorPlugin;
}

export default apiSensor;
