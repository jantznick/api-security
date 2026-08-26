import { ENVELOPE_VERSION, redactHeaders, shapeBody } from './redaction.js';

/**
 * Build one traffic sample for the agent.
 * Bodies are shape-only; sensitive headers are redacted.
 *
 * @param {object} input
 * @param {boolean} [input.responseBodyCaptured] When set, recorded on the sample
 *   so inventory can tell whether a response schema came from a captured body.
 *   Omitted from the payload when not provided (backward-compatible fixtures).
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
  responseBodyCaptured,
  authObserved = 'none',
  timestamp = new Date().toISOString(),
}) {
  const reqCt =
    requestHeaders['content-type'] ||
    requestHeaders['Content-Type'] ||
    null;
  const resCt =
    responseHeaders['content-type'] ||
    responseHeaders['Content-Type'] ||
    null;

  const sample = {
    method: String(method || 'GET').toUpperCase(),
    path: String(path || '/'),
    statusCode: Number(statusCode) || 0,
    latencyMs: Number(latencyMs) || 0,
    authObserved,
    timestamp,
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

  if (typeof responseBodyCaptured === 'boolean') {
    sample.responseBodyCaptured = responseBodyCaptured;
  }

  return sample;
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
