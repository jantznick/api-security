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
  /** Explicit caller identity for topology (SF3). Prefer this over UA guessing. */
  serviceName: process.env.API_SENSOR_SERVICE_NAME || '',
  /** How often to refresh protect policy from agent (ms). Default 15 minutes. */
  policyRefreshMs: Number(process.env.API_SENSOR_POLICY_REFRESH_MS || 15 * 60 * 1000),
};

const MAX_RESPONSE_CAPTURE_BYTES = 64 * 1024;

const SENSITIVE_PATH_RE =
  /\/(admin|auth|login|logout|signup|register|users?|billing|payment|pay|checkout)\b/i;

function isJsonContentType(res) {
  try {
    const ct = res.getHeader?.('content-type') || res.getHeader?.('Content-Type') || '';
    return String(ct).toLowerCase().includes('application/json');
  } catch {
    return false;
  }
}

function tryParseJsonChunk(chunk) {
  try {
    if (chunk == null || chunk === '') return undefined;
    if (typeof chunk === 'function') return undefined;
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
 * Express middleware for API Glimpse.
 *
 * @param {object} options
 * @param {string} [options.serviceName] Set API_SENSOR_SERVICE_NAME for topology
 * @param {object} [options.protect] Optional static protect override (tests)
 */
export function apiSensor(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const buffer = [];
  let flushing = false;
  let consecutiveFailures = 0;
  let circuitOpenUntil = 0;

  /** @type {{ enabled: boolean, mode: string, rule: string|null, version: number, rules: object[] }} */
  let policy = {
    enabled: false,
    mode: 'observe',
    rule: null,
    version: 0,
    rules: [],
  };
  if (cfg.protect && typeof cfg.protect === 'object') {
    policy = {
      enabled: Boolean(cfg.protect.enabled),
      mode: cfg.protect.mode || 'observe',
      rule: cfg.protect.rule || null,
      version: cfg.protect.version || 1,
      rules: Array.isArray(cfg.protect.rules) ? cfg.protect.rules : [],
    };
  }

  const protectStats = { wouldBlock: 0, blocked: 0 };

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

  async function refreshPolicy() {
    if (!cfg.apiKey || !cfg.agentUrl) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
      const res = await fetch(`${cfg.agentUrl.replace(/\/$/, '')}/v1/policy`, {
        method: 'GET',
        headers: { 'X-API-Key': cfg.apiKey },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return;
      const body = await res.json();
      policy = {
        enabled: Boolean(body.enabled),
        mode: body.mode || 'observe',
        rule: body.rule || null,
        version: Number(body.version) || 0,
        rules: Array.isArray(body.rules) ? body.rules : [],
      };
    } catch {
      /* fail-open: keep last known policy */
    }
  }

  /**
   * MVP protect: single rule deny_unauth_sensitive — no auth on sensitive paths.
   */
  function evaluateProtect(req) {
    try {
      if (!policy.enabled) return 'allow';
      const path = req.originalUrl?.split('?')[0] || req.path || '/';
      const auth = observeAuth(req);
      if (policy.rule === 'deny_unauth_sensitive' || policy.rules.some((r) => r.id === 'deny_unauth_sensitive')) {
        if (auth === 'none' && SENSITIVE_PATH_RE.test(path)) {
          return 'deny';
        }
      }
      for (const rule of policy.rules || []) {
        if (rule.action !== 'deny') continue;
        const match = rule.match || {};
        if (Array.isArray(match.authModes) && !match.authModes.includes(auth)) continue;
        if (match.pathTemplate) {
          const pat = String(match.pathTemplate)
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*');
          try {
            if (!new RegExp(`^${pat}$`, 'i').test(path) && !SENSITIVE_PATH_RE.test(path)) {
              // also allow substring match for MVP glob quirks
              if (!path.match(SENSITIVE_PATH_RE)) continue;
            }
          } catch {
            continue;
          }
        }
        return 'deny';
      }
    } catch {
      return 'allow';
    }
    return 'allow';
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

  // Initial policy fetch + periodic refresh (SF7)
  refreshPolicy().catch(() => {});
  const policyInterval = setInterval(() => {
    refreshPolicy().catch(() => {});
  }, Math.max(30_000, cfg.policyRefreshMs || 15 * 60 * 1000));
  if (typeof policyInterval.unref === 'function') policyInterval.unref();

  return function apiSensorMiddleware(req, res, next) {
    try {
      const decision = evaluateProtect(req);
      if (decision === 'deny') {
        protectStats.wouldBlock += 1;
        if (policy.mode === 'block') {
          protectStats.blocked += 1;
          try {
            if (!res.headersSent) {
              res.status(403).json({ error: 'blocked', rule: policy.rule || 'deny_unauth_sensitive' });
            }
          } catch {
            /* ignore */
          }
          return;
        }
      }

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
              // skip binary here
            } else if (body !== undefined && typeof body !== 'function') {
              if (typeof body === 'object' && body !== null && typeof body.pipe === 'function') {
                // stream
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

      const requestBody = req.body && typeof req.body === 'object' ? req.body : undefined;

      res.on('finish', () => {
        try {
          if (buffer.length >= cfg.maxBufferSize) {
            buffer.shift();
          }

          const responseBodyCaptured = responseBody !== undefined;
          const caller = resolveCallerHints({
            headers: req.headers || {},
            serviceName: cfg.serviceName || null,
          });
          const sample = createSample({
            method: req.method,
            path: req.originalUrl?.split('?')[0] || req.path || '/',
            statusCode: res.statusCode,
            latencyMs: Date.now() - start,
            requestHeaders: req.headers || {},
            responseHeaders: res.getHeaders?.() || {},
            requestBody,
            responseBody,
            responseBodyCaptured,
            caller,
            authObserved: observeAuth(req),
          });
          buffer.push(sample);

          if (buffer.length >= cfg.maxBatchSize) {
            flush().catch(() => {});
          }
        } catch {
          /* fail-open */
        }
      });
    } catch {
      /* fail-open */
    }

    next();
  };
}

export default apiSensor;
