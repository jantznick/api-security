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
  serviceName: '',
};

const kSkip = Symbol('apiglimpse.skip');
const kStart = Symbol('apiglimpse.start');
const kResponseBody = Symbol('apiglimpse.responseBody');

/**
 * Fastify plugin for API Glimpse: captures request/response metadata,
 * redacts secrets, buffers, and flushes async batches to the collector.
 *
 * @param {object} options
 * @param {string} [options.agentUrl]
 * @param {string} [options.apiKey]
 * @param {number} [options.sampleRate] 0–1
 * @param {string} [options.serviceName] Fallback caller label (or API_SENSOR_SERVICE_NAME)
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
  if (options.serviceName != null && String(options.serviceName).trim() !== '') {
    cfg.serviceName = String(options.serviceName).trim();
  }

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

  function parseResponsePayload(payload) {
    if (payload === undefined || payload === null) return undefined;
    try {
      if (typeof payload === 'string') {
        try {
          return JSON.parse(payload);
        } catch {
          return undefined;
        }
      }
      if (Buffer.isBuffer(payload)) {
        return undefined;
      }
      if (typeof payload === 'object') {
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
      } else if (!res.ok && res.status === 401) {
        // bad key
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

    fastify.addHook('onSend', async (request, _reply, payload) => {
      try {
        if (request[kSkip]) return payload;
        if (request[kResponseBody] === undefined) {
          request[kResponseBody] = parseResponsePayload(payload);
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

        const headers = request.headers || {};
        const caller = resolveCallerHints(headers, { serviceName: cfg.serviceName });

        const sample = createSample({
          method: request.method,
          path: (request.url || '/').split('?')[0] || '/',
          statusCode: reply.statusCode,
          latencyMs: Date.now() - (request[kStart] || Date.now()),
          requestHeaders: headers,
          responseHeaders: reply.getHeaders?.() || {},
          requestBody,
          responseBody: request[kResponseBody],
          authObserved: observeAuth(request),
          caller,
          serviceName: cfg.serviceName,
        });
        buffer.push(sample);

        if (buffer.length >= cfg.maxBatchSize) {
          flush().catch(() => {});
        }
      } catch {
        /* fail-open */
      }
    });
  }

  apiSensorPlugin[Symbol.for('skip-override')] = true;
  apiSensorPlugin[Symbol.for('fastify.display-name')] = '@apiglimpse/fastify';

  return apiSensorPlugin;
}

export default apiSensor;
