import { createEnvelope, createSample } from '@apiglimpse/shared';

export const DEFAULTS = {
  agentUrl: 'http://localhost:8080',
  apiKey: '',
  sampleRate: 1.0,
  flushIntervalMs: 1000,
  maxBatchSize: 50,
  maxBufferSize: 500,
  requestTimeoutMs: 2000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 15000,
  /** Max bytes buffered for JSON request/response body shaping. */
  maxBodyBytes: 64 * 1024,
};

/**
 * Async sample buffer + circuit breaker (same fail-open pattern as Express middleware).
 * Never blocks the proxied request path.
 */
export function createSampler(options = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(options).filter(([, v]) => v !== undefined),
  );
  const cfg = { ...DEFAULTS, ...cleaned };
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

  function observeAuth(headers) {
    try {
      const auth = headers?.authorization || headers?.Authorization;
      if (auth && /^Bearer\s+/i.test(String(auth))) return 'bearer';
      if (headers?.cookie || headers?.Cookie) return 'cookie';
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

  function enqueue(sampleFields) {
    try {
      if (!shouldSample()) return;

      if (buffer.length >= cfg.maxBufferSize) {
        buffer.shift();
      }

      const sample = createSample({
        ...sampleFields,
        authObserved: sampleFields.authObserved ?? observeAuth(sampleFields.requestHeaders),
      });
      buffer.push(sample);

      if (buffer.length >= cfg.maxBatchSize) {
        flush().catch(() => {});
      }
    } catch {
      /* fail-open */
    }
  }

  function start() {
    if (interval) return;
    interval = setInterval(() => {
      flush().catch(() => {});
    }, cfg.flushIntervalMs);
    if (typeof interval.unref === 'function') interval.unref();
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    return flush().catch(() => {});
  }

  return {
    cfg,
    enqueue,
    flush,
    start,
    stop,
    /** @internal test helpers */
    _buffer: buffer,
    _circuitOpen: circuitOpen,
    _recordFailure: recordFailure,
    _recordSuccess: recordSuccess,
  };
}

/**
 * Parse a Buffer as JSON when content-type looks like JSON and size is within cap.
 * Returns undefined on binary / non-JSON / oversized bodies (shape skipped).
 */
export function tryParseJsonBody(buf, contentType, maxBodyBytes) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) return undefined;
  if (buf.length > maxBodyBytes) return undefined;
  const ct = String(contentType || '').toLowerCase();
  if (!ct.includes('json') && !ct.includes('javascript')) {
    const first = buf[0];
    if (first !== 0x7b /* { */ && first !== 0x5b /* [ */) return undefined;
  }
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return undefined;
  }
}
