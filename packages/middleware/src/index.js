import { createEnvelope, createSample } from '@apiglimpse/shared';

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
};

/** Max bytes we will attempt to parse from res.end / stringified JSON. */
const MAX_RESPONSE_CAPTURE_BYTES = 64 * 1024;

function isJsonContentType(res) {
  try {
    const ct = res.getHeader?.('content-type') || res.getHeader?.('Content-Type') || '';
    return String(ct).toLowerCase().includes('application/json');
  } catch {
    return false;
  }
}

/**
 * Parse a string/Buffer as JSON when under the capture cap.
 * Skips streams, oversized bodies, and non-JSON.
 * @returns {any|undefined} Parsed value, or undefined if not capturable.
 */
function tryParseJsonChunk(chunk) {
  try {
    if (chunk == null || chunk === '') return undefined;
    // Functions are callbacks for res.end(cb) — not a body.
    if (typeof chunk === 'function') return undefined;
    // Never treat streams / readers as capturable bodies.
    if (typeof chunk === 'object' && !Buffer.isBuffer(chunk) && typeof chunk.pipe === 'function') {
      return undefined;
    }

    if (typeof chunk === 'string') {
      if (Buffer.byteLength(chunk, 'utf8') > MAX_RESPONSE_CAPTURE_BYTES) return undefined;
      try {
        return JSON.parse(chunk);
      } catch {
        return undefined;
      }
    }

    if (Buffer.isBuffer(chunk)) {
      if (chunk.length > MAX_RESPONSE_CAPTURE_BYTES) return undefined;
      try {
        return JSON.parse(chunk.toString('utf8'));
      } catch {
        return undefined;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Express middleware for API Glimpse: captures request/response metadata,
 * redacts secrets, buffers, and flushes async batches to the collector.
 *
 * Never awaits the collector on the request path. Errors are swallowed
 * so sampling stays off the critical path.
 *
 * @param {object} options
 * @param {string} [options.agentUrl]
 * @param {string} [options.apiKey]
 * @param {number} [options.sampleRate] 0–1
 */
export function apiSensor(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
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

  function observeAuth(req) {
    try {
      const auth = req.headers?.authorization || req.headers?.Authorization;
      if (auth && /^Bearer\s+/i.test(String(auth))) return 'bearer';
      if (req.headers?.cookie) return 'cookie';
      return 'none';
    } catch {
      return 'none';
    }
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

  return function apiSensorMiddleware(req, res, next) {
    try {
      if (!shouldSample()) {
        next();
        return;
      }

      const start = Date.now();
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      const originalEnd = res.end.bind(res);
      let responseBody;

      res.json = (body) => {
        responseBody = body;
        return originalJson(body);
      };

      res.send = (body) => {
        if (responseBody === undefined) {
          try {
            if (typeof body === 'string') {
              const parsed = tryParseJsonChunk(body);
              if (parsed !== undefined) responseBody = parsed;
            } else if (Buffer.isBuffer(body)) {
              // Binary / opaque buffers skipped here; res.end may still capture
              // when Content-Type is application/json.
            } else if (body !== undefined && typeof body !== 'function') {
              if (typeof body === 'object' && body !== null && typeof body.pipe === 'function') {
                // stream — skip
              } else {
                responseBody = body;
              }
            }
          } catch {
            /* ignore */
          }
        }
        return originalSend(body);
      };

      // Capture JSON written via res.end(string|Buffer) when Content-Type is JSON.
      // Skip streams/binary; never throw into the app.
      res.end = function apiglimpseEnd(chunk, encoding, cb) {
        try {
          if (responseBody === undefined && chunk != null && typeof chunk !== 'function') {
            if (isJsonContentType(res)) {
              const parsed = tryParseJsonChunk(chunk);
              if (parsed !== undefined) responseBody = parsed;
            }
          }
        } catch {
          /* fail-open */
        }
        return originalEnd(chunk, encoding, cb);
      };

      // Capture request body if express.json already parsed it
      const requestBody = req.body && typeof req.body === 'object' ? req.body : undefined;

      res.on('finish', () => {
        try {
          if (buffer.length >= cfg.maxBufferSize) {
            buffer.shift();
          }

          const responseBodyCaptured = responseBody !== undefined && responseBody !== null;
          const sample = createSample({
            method: req.method,
            path: req.originalUrl?.split('?')[0] || req.path || '/',
            statusCode: res.statusCode,
            latencyMs: Date.now() - start,
            requestHeaders: req.headers || {},
            responseHeaders: res.getHeaders?.() || {},
            requestBody,
            responseBody: responseBodyCaptured ? responseBody : undefined,
            responseBodyCaptured,
            authObserved: observeAuth(req),
          });
          buffer.push(sample);

          if (buffer.length >= cfg.maxBatchSize) {
            flush().catch(() => {});
          }
        } catch {
          /* fail-open: never break the app */
        }
      });
    } catch {
      /* fail-open */
    }

    next();
  };
}

export default apiSensor;
