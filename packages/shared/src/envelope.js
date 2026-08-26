import { ENVELOPE_VERSION, redactHeaders, shapeBody } from './redaction.js';
import { resolveCallerHints } from './caller.js';

/**
 * Build one traffic sample for the agent.
 * Bodies are shape-only; sensitive headers are redacted.
 *
 * Optional `caller` (or derived from headers + serviceName) is additive on
 * envelope v1 — older agents ignore unknown sample fields.
 */
export function createSample({
  method,
  path,
  statusCode,
  latencyMs,
  requestHeaders = {},
  responseHeaders = {},
  requestBody,
  responseBody,
  authObserved = 'none',
  timestamp = new Date().toISOString(),
  /** Precomputed caller hints; when omitted, derived from headers / serviceName */
  caller,
  /** Connector config fallback when x-service-name / x-client-name absent */
  serviceName,
}) {
  const reqCt =
    requestHeaders['content-type'] ||
    requestHeaders['Content-Type'] ||
    null;
  const resCt =
    responseHeaders['content-type'] ||
    responseHeaders['Content-Type'] ||
    null;

  const resolvedCaller =
    caller && typeof caller === 'object'
      ? {
          name: caller.name != null ? String(caller.name).slice(0, 128) || null : null,
          source:
            caller.source === 'header' || caller.source === 'config' ? caller.source : null,
          uaFamily: ['browser', 'sdk', 'curl', 'unknown'].includes(caller.uaFamily)
            ? caller.uaFamily
            : 'unknown',
        }
      : resolveCallerHints(requestHeaders, { serviceName });

  return {
    method: String(method || 'GET').toUpperCase(),
    path: String(path || '/'),
    statusCode: Number(statusCode) || 0,
    latencyMs: Number(latencyMs) || 0,
    authObserved,
    timestamp,
    /** SF3 caller → endpoint topology hints (optional; backward compatible) */
    caller: resolvedCaller,
    request: {
      contentType: reqCt ? String(reqCt).split(';')[0].trim() : null,
      headerNames: Object.keys(requestHeaders).map((h) => h.toLowerCase()),
      headers: redactHeaders(requestHeaders),
      bodyShape: requestBody !== undefined ? shapeBody(requestBody) : null,
    },
    response: {
      contentType: resCt ? String(resCt).split(';')[0].trim() : null,
      headerNames: Object.keys(responseHeaders).map((h) => h.toLowerCase()),
      headers: redactHeaders(responseHeaders),
      bodyShape: responseBody !== undefined ? shapeBody(responseBody) : null,
    },
  };
}

export function createEnvelope({ apiKey, samples }) {
  return {
    version: ENVELOPE_VERSION,
    apiKey,
    samples: Array.isArray(samples) ? samples : [],
    sentAt: new Date().toISOString(),
  };
}

export function validateEnvelope(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be an object' };
  }
  if (body.version !== ENVELOPE_VERSION) {
    return { ok: false, error: `Unsupported envelope version: ${body.version}` };
  }
  if (!Array.isArray(body.samples)) {
    return { ok: false, error: 'samples must be an array' };
  }
  return { ok: true };
}
