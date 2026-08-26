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
  /**
   * When true (default), clone the Request and attempt JSON body capture for
   * sampling without consuming the handler's body stream.
   * Set false if you prefer metadata-only or handle body yourself.
   */
  captureRequestBody: true,
  /**
   * When true (default), clone the Response and attempt JSON body capture.
   * Streaming / oversized / non-JSON responses are skipped (fail-open).
   */
  captureResponseBody: true,
};

/** Max bytes we will attempt to parse from a cloned JSON body. */
const MAX_BODY_CAPTURE_BYTES = 64 * 1024;

function utf8ByteLength(text) {
  try {
    if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
      return Buffer.byteLength(text, 'utf8');
    }
  } catch {
    /* fall through */
  }
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return String(text || '').length;
  }
}

/**
 * @returns {object}
 */
function resolveEnvDefaults() {
  return {
    agentUrl: process.env.API_SENSOR_AGENT_URL || DEFAULTS.agentUrl,
    apiKey: process.env.API_SENSOR_KEY || DEFAULTS.apiKey,
    sampleRate:
      process.env.API_SENSOR_SAMPLE_RATE != null
        ? Number(process.env.API_SENSOR_SAMPLE_RATE)
        : DEFAULTS.sampleRate,
    serviceName: process.env.API_SENSOR_SERVICE_NAME || DEFAULTS.serviceName,
  };
}

function isJsonContentType(contentType) {
  return String(contentType || '')
    .toLowerCase()
    .includes('application/json');
}

function headersToObject(headers) {
  const out = {};
  if (!headers) return out;
  try {
    if (typeof headers.forEach === 'function') {
      headers.forEach((value, key) => {
        out[String(key).toLowerCase()] = value;
      });
      return out;
    }
    if (typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        if (value == null) continue;
        out[String(key).toLowerCase()] = Array.isArray(value)
          ? value.join(', ')
          : String(value);
      }
    }
  } catch {
    /* fail-open */
  }
  return out;
}

function contentLengthBytes(headers) {
  try {
    const raw =
      (typeof headers?.get === 'function'
        ? headers.get('content-length')
        : null) ||
      headers?.['content-length'] ||
      headers?.['Content-Length'];
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function observeAuth(headersObj) {
  try {
    const auth = headersObj?.authorization || headersObj?.Authorization;
    if (auth && /^Bearer\s+/i.test(String(auth))) return 'bearer';
    if (headersObj?.cookie) return 'cookie';
    return 'none';
  } catch {
    return 'none';
  }
}

function requestPath(request) {
  try {
    const url = new URL(request.url);
    return url.pathname || '/';
  } catch {
    try {
      const raw = String(request.url || '/');
      return raw.split('?')[0] || '/';
    } catch {
      return '/';
    }
  }
}

/**
 * Best-effort JSON parse from a Request/Response clone.
 * Never throws; returns undefined when body cannot be shaped.
 */
async function peekJsonBody(source, { contentType, maxBytes = MAX_BODY_CAPTURE_BYTES } = {}) {
  try {
    if (!source || typeof source.clone !== 'function') return undefined;
    if (contentType && !isJsonContentType(contentType)) return undefined;

    const len = contentLengthBytes(source.headers);
    if (len != null && len > maxBytes) return undefined;

    const clone = source.clone();
    const text = await clone.text();
    if (!text) return undefined;
    if (utf8ByteLength(text) > maxBytes) return undefined;
    try {
      const parsed = JSON.parse(text);
      return parsed === null ? undefined : parsed;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Create an API Glimpse sensor for Next.js App Router.
 *
 * Prefer wrapping Route Handlers with `sensor.wrap(...)` over global patches.
 * Sampling is fail-open: collector errors never reject the app response.
 *
 * @param {object} [options]
 * @param {string} [options.agentUrl]
 * @param {string} [options.apiKey]
 * @param {number} [options.sampleRate] 0–1
 * @param {boolean} [options.captureRequestBody]
 * @param {boolean} [options.captureResponseBody]
 * @param {string} [options.serviceName]
 */
export function createApiSensor(options = {}) {
  const cfg = {
    ...DEFAULTS,
    ...resolveEnvDefaults(),
    ...options,
  };

  const buffer = [];
  let flushing = false;
  let consecutiveFailures = 0;
  let circuitOpenUntil = 0;
  let interval = null;

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

  function ensureInterval() {
    if (interval != null) return;
    // Edge runtimes may lack durable timers; still schedule when available.
    if (typeof setInterval !== 'function') return;
    try {
      interval = setInterval(() => {
        flush().catch(() => {});
      }, cfg.flushIntervalMs);
      if (typeof interval.unref === 'function') interval.unref();
    } catch {
      interval = null;
    }
  }

  function enqueue(sample) {
    try {
      if (buffer.length >= cfg.maxBufferSize) {
        buffer.shift();
      }
      buffer.push(sample);
      ensureInterval();
      if (buffer.length >= cfg.maxBatchSize) {
        flush().catch(() => {});
      }
    } catch {
      /* fail-open */
    }
  }

  /**
   * Record one completed request/response pair. Safe to call fire-and-forget.
   *
   * @param {Request} request
   * @param {Response} response
   * @param {object} [meta]
   * @param {number} [meta.startMs]
   * @param {unknown} [meta.requestBody]
   * @param {unknown} [meta.responseBody]
   * @param {boolean} [meta.responseBodyCaptured]
   */
  async function record(request, response, meta = {}) {
    try {
      if (!shouldSample()) return;

      const startMs = meta.startMs || Date.now();
      const reqHeaders = headersToObject(request?.headers);
      let requestBody = meta.requestBody;
      let responseBody = meta.responseBody;
      let responseBodyCaptured = meta.responseBodyCaptured;

      if (!('requestBody' in meta) && cfg.captureRequestBody) {
        const ct =
          reqHeaders['content-type'] ||
          (typeof request?.headers?.get === 'function'
            ? request.headers.get('content-type')
            : '') ||
          '';
        requestBody = await peekJsonBody(request, { contentType: ct });
      }

      const resHeaders = headersToObject(response?.headers);
      if (
        !('responseBody' in meta) &&
        !('responseBodyCaptured' in meta) &&
        cfg.captureResponseBody &&
        response
      ) {
        const ct =
          resHeaders['content-type'] ||
          (typeof response.headers?.get === 'function'
            ? response.headers.get('content-type')
            : '') ||
          '';
        responseBody = await peekJsonBody(response, { contentType: ct });
        responseBodyCaptured = responseBody !== undefined;
      } else if (typeof responseBodyCaptured !== 'boolean') {
        responseBodyCaptured = responseBody !== undefined && responseBody !== null;
      }

      const sample = createSample({
        method: request?.method || 'GET',
        path: requestPath(request),
        statusCode: response?.status ?? 0,
        latencyMs: Date.now() - startMs,
        requestHeaders: reqHeaders,
        responseHeaders: resHeaders,
        requestBody,
        responseBody: responseBodyCaptured ? responseBody : undefined,
        responseBodyCaptured: Boolean(responseBodyCaptured),
        caller: resolveCallerHints({
          headers: reqHeaders,
          serviceName: cfg.serviceName || null,
        }),
        authObserved: observeAuth(reqHeaders),
      });
      enqueue(sample);
    } catch {
      /* fail-open */
    }
  }

  /**
   * Wrap an App Router Route Handler (`GET`/`POST`/…).
   * Captures method, path, status, latency, headers, and JSON body shapes.
   *
   * @template {(...args: any[]) => any} H
   * @param {H} handler
   * @returns {H}
   */
  function wrap(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('@apiglimpse/next wrap() expects a function');
    }

    const wrapped = async function apiglimpseWrappedHandler(request, context) {
      const startMs = Date.now();

      // Clone+peek BEFORE the handler runs — Request bodies are single-consume.
      let requestBody;
      if (cfg.captureRequestBody) {
        try {
          const ct =
            (typeof request?.headers?.get === 'function'
              ? request.headers.get('content-type')
              : '') || '';
          requestBody = await peekJsonBody(request, { contentType: ct });
        } catch {
          requestBody = undefined;
        }
      }

      let response;
      try {
        response = await handler(request, context);
      } catch (err) {
        // Still attempt a synthetic 500 sample when possible, then rethrow.
        try {
          const synthetic = new Response(null, { status: 500 });
          record(request, synthetic, {
            startMs,
            requestBody,
            responseBodyCaptured: false,
          }).catch(() => {});
          flush().catch(() => {});
        } catch {
          /* ignore */
        }
        throw err;
      }

      // Peek response JSON via clone BEFORE returning — callers may consume
      // the body stream immediately after this function resolves.
      let responseBody;
      let responseBodyCaptured = false;
      if (cfg.captureResponseBody && response) {
        try {
          const ct =
            (typeof response.headers?.get === 'function'
              ? response.headers.get('content-type')
              : '') || '';
          responseBody = await peekJsonBody(response, { contentType: ct });
          responseBodyCaptured = responseBody !== undefined;
        } catch {
          responseBody = undefined;
          responseBodyCaptured = false;
        }
      }

      // Fire-and-forget sample + flush; never await collector on the critical path.
      const out = response;
      Promise.resolve()
        .then(() =>
          record(request, out, {
            startMs,
            requestBody,
            responseBody,
            responseBodyCaptured,
          }),
        )
        .then(() => {
          if (buffer.length > 0) return flush();
        })
        .catch(() => {});

      return out;
    };

    return /** @type {H} */ (wrapped);
  }

  /**
   * Optional Next.js middleware helper.
   * Prefer Route Handler `wrap` for response body capture — middleware often
   * only sees `NextResponse.next()` (status 200) and cannot read route bodies.
   *
   * @param {(request: Request, event?: any) => any} handler
   */
  function wrapMiddleware(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('@apiglimpse/next wrapMiddleware() expects a function');
    }

    return async function apiglimpseMiddleware(request, event) {
      const startMs = Date.now();
      let response;
      try {
        response = await handler(request, event);
      } catch (err) {
        throw err;
      }

      const out = response;
      const task = Promise.resolve()
        .then(() =>
          record(request, out || new Response(null, { status: 200 }), {
            startMs,
            // Middleware typically cannot capture route response JSON.
            responseBodyCaptured: false,
            responseBody: undefined,
          }),
        )
        .then(() => flush())
        .catch(() => {});

      try {
        if (event && typeof event.waitUntil === 'function') {
          event.waitUntil(task);
        }
      } catch {
        /* ignore */
      }

      return out;
    };
  }

  ensureInterval();

  return {
    wrap,
    wrapMiddleware,
    record,
    flush,
    /** @internal test helper */
    _buffer: buffer,
    /** @internal test helper */
    _cfg: cfg,
  };
}

/** @type {ReturnType<typeof createApiSensor> | null} */
let defaultSensor = null;

function getDefaultSensor(options) {
  if (options && Object.keys(options).length > 0) {
    return createApiSensor(options);
  }
  if (!defaultSensor) {
    defaultSensor = createApiSensor();
  }
  return defaultSensor;
}

/**
 * Convenience: wrap a Route Handler with a process-default sensor (env-backed).
 *
 * @example
 * export const GET = withApiSensor(async () => Response.json({ ok: true }));
 *
 * @template {(...args: any[]) => any} H
 * @param {H} handler
 * @param {object} [options] Passed to createApiSensor when provided
 * @returns {H}
 */
export function withApiSensor(handler, options) {
  return getDefaultSensor(options).wrap(handler);
}

/**
 * Convenience: wrap Next.js middleware with env-backed sensor.
 * Metadata-first; see README limitations.
 *
 * @param {(request: Request, event?: any) => any} handler
 * @param {object} [options]
 */
export function withApiSensorMiddleware(handler, options) {
  return getDefaultSensor(options).wrapMiddleware(handler);
}

export default createApiSensor;
