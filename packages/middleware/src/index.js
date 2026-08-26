import { createEnvelope, createSample } from '@apiglimpse/shared';
import { createProtectController } from './protect.js';

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
  /**
   * Protect (SF7) — opt-in. Default disabled / observe-friendly.
   * @type {{ enabled?: boolean, mode?: 'observe'|'block'|'shadow', policyUrl?: string, failMode?: 'open'|'closed', refreshIntervalMs?: number, policy?: object, onDeny?: Function } | undefined}
   */
  protect: undefined,
};

/**
 * Express middleware for API Glimpse: captures request/response metadata,
 * redacts secrets, buffers, and flushes async batches to the collector.
 *
 * Never awaits the collector on the request path. Errors are swallowed
 * so sampling stays off the critical path.
 *
 * Optional `protect` (SF7): local policy evaluate before next().
 * - mode 'observe'|'shadow': allow, count would-block, tag sample
 * - mode 'block': deny matching requests; fail-open by default
 *
 * @param {object} options
 * @param {string} [options.agentUrl]
 * @param {string} [options.apiKey]
 * @param {number} [options.sampleRate] 0–1
 * @param {object} [options.protect]
 */
export function apiSensor(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const buffer = [];
  let flushing = false;
  let consecutiveFailures = 0;
  let circuitOpenUntil = 0;

  const protect =
    cfg.protect && typeof cfg.protect === 'object'
      ? createProtectController(cfg.protect)
      : null;

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

  function enqueueSample(req, res, start, responseBody, protectResult) {
    try {
      if (!shouldSample() && !protectResult?.wouldBlock && !protectResult?.blocked) {
        return;
      }
      if (buffer.length >= cfg.maxBufferSize) {
        buffer.shift();
      }

      const sample = createSample({
        method: req.method,
        path: req.originalUrl?.split('?')[0] || req.path || '/',
        statusCode: res.statusCode,
        latencyMs: Date.now() - start,
        requestHeaders: req.headers || {},
        responseHeaders: res.getHeaders?.() || {},
        requestBody: req.body && typeof req.body === 'object' ? req.body : undefined,
        responseBody,
        authObserved: observeAuth(req),
        wouldBlock: Boolean(protectResult?.wouldBlock),
        blocked: Boolean(protectResult?.blocked),
      });
      buffer.push(sample);

      if (buffer.length >= cfg.maxBatchSize) {
        flush().catch(() => {});
      }
    } catch {
      /* fail-open */
    }
  }

  function apiSensorMiddleware(req, res, next) {
    const start = Date.now();
    const authObserved = observeAuth(req);
    let protectResult = { allow: true, wouldBlock: false, blocked: false, rule: null };

    try {
      if (protect) {
        protectResult = protect.decide({
          method: req.method,
          path: req.originalUrl?.split('?')[0] || req.path || '/',
          authObserved,
          req,
          res,
        });
      }
    } catch {
      protectResult = { allow: true, wouldBlock: false, blocked: false, rule: null };
    }

    if (!protectResult.allow) {
      try {
        const onDeny = cfg.protect?.onDeny;
        if (typeof onDeny === 'function') {
          onDeny({ req, res, rule: protectResult.rule });
        } else if (!res.headersSent) {
          res.status(403).json({ error: 'blocked', ruleId: protectResult.rule?.id || null });
        }
        // Still record a sample asynchronously (discovery stays async)
        setImmediate(() => {
          enqueueSample(req, res, start, undefined, protectResult);
        });
      } catch {
        /* fail-open path if deny handler throws — allow through */
        next();
        return;
      }
      return;
    }

    try {
      if (!shouldSample() && !protectResult.wouldBlock) {
        next();
        return;
      }

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      let responseBody;

      res.json = (body) => {
        responseBody = body;
        return originalJson(body);
      };

      res.send = (body) => {
        if (responseBody === undefined) {
          try {
            if (typeof body === 'string') {
              try {
                responseBody = JSON.parse(body);
              } catch {
                responseBody = undefined;
              }
            } else if (Buffer.isBuffer(body)) {
              // skip binary
            } else {
              responseBody = body;
            }
          } catch {
            /* ignore */
          }
        }
        return originalSend(body);
      };

      res.on('finish', () => {
        enqueueSample(req, res, start, responseBody, protectResult);
      });
    } catch {
      /* fail-open */
    }

    next();
  }

  /** Test / ops hook */
  apiSensorMiddleware.getProtectStats = protect ? () => protect.getStats() : () => null;
  apiSensorMiddleware.refreshProtectPolicy = protect
    ? () => protect.refreshPolicy()
    : async () => {};

  return apiSensorMiddleware;
}

export { createProtectController, evaluatePolicy, matchPathTemplate, ruleMatches } from './protect.js';
export default apiSensor;
