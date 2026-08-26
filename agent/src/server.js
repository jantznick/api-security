import 'dotenv/config';
import express from 'express';
import { validateEnvelope } from '@apiglimpse/shared';
import { InventoryAggregator } from './pipeline/aggregate.js';
import { upsertInventory } from './lib/ingestClient.js';
import { createKeyResolver } from './lib/keyResolver.js';
import { createRateLimiter } from './lib/rateLimit.js';

const PORT = Number(process.env.PORT || 8080);
const INGEST_URL = process.env.INGEST_URL || 'http://localhost:3002';
const DEBUG_BUFFER = process.env.AGENT_DEBUG_BUFFER === 'true';
const FLUSH_MS = Number(process.env.AGENT_FLUSH_MS || 2000);
const RATE_WINDOW_MS = Number(process.env.AGENT_RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_MAX = Number(process.env.AGENT_RATE_LIMIT_MAX || 120);

const app = express();
app.use(express.json({ limit: '2mb' }));

const keyResolver = createKeyResolver({ ingestUrl: INGEST_URL });
const rateLimiter = createRateLimiter({
  windowMs: RATE_WINDOW_MS,
  maxRequests: RATE_MAX,
});

/**
 * Per-serviceId aggregator buckets. Each stores the API key used for flush.
 * @type {Map<string, { aggregator: InventoryAggregator, apiKey: string }>}
 */
const buckets = new Map();
const debugRing = [];
const DEBUG_MAX = 50;
let flushTimer = null;

function getBucket(serviceId, apiKey) {
  let bucket = buckets.get(serviceId);
  if (!bucket) {
    bucket = { aggregator: new InventoryAggregator(), apiKey };
    buckets.set(serviceId, bucket);
  } else {
    bucket.apiKey = apiKey;
  }
  return bucket;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushToIngest();
  }, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

function requeueDeltas(aggregator, { endpoints = [], edges = [] }) {
  for (const d of endpoints) {
    const key = `${d.method} ${d.pathTemplate}`;
    const prev = aggregator.endpoints.get(key);
    if (prev) {
      prev.hitCount += d.hitCount || 0;
      for (const m of d.authModes || []) prev.authModes.add(m);
      for (const ct of d.contentTypes || []) prev.contentTypes.add(ct);
      for (const [code, count] of Object.entries(d.statusCodes || {})) {
        prev.statusCodes[code] = (prev.statusCodes[code] || 0) + Number(count || 0);
      }
      prev.lastSeenAt = d.lastSeenAt || prev.lastSeenAt;
      prev.signals = [...(prev.signals || []), ...(d.signals || [])];
    } else {
      aggregator.endpoints.set(key, {
        method: d.method,
        pathTemplate: d.pathTemplate,
        hitCount: d.hitCount || 0,
        authModes: new Set(d.authModes || []),
        statusCodes: { ...(d.statusCodes || {}) },
        contentTypes: new Set(d.contentTypes || []),
        requestSchema: d.requestSchema,
        responseSchema: d.responseSchema,
        signals: d.signals || [],
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
      });
    }
  }

  for (const e of edges) {
    const edgeKey = `${e.callerKey}|${e.method}|${e.pathTemplate}`;
    const prev = aggregator.edges.get(edgeKey);
    if (prev) {
      prev.hitCount += e.hitCount || 0;
      prev.lastSeenAt = e.lastSeenAt || prev.lastSeenAt;
      if (e.callerName) prev.callerName = e.callerName;
      if (e.callerSource) prev.callerSource = e.callerSource;
    } else {
      aggregator.edges.set(edgeKey, { ...e });
    }
  }
}

async function flushBucket(serviceId, bucket) {
  const { endpoints, edges } = bucket.aggregator.drain();
  if (!endpoints.length && !edges.length) return;

  const apiKey = bucket.apiKey;
  if (!apiKey) {
    console.warn(
      `[agent] Skipping ingest flush for ${serviceId} (${endpoints.length} endpoints, ${edges.length} edges) — missing apiKey`,
    );
    return;
  }

  try {
    const result = await upsertInventory({
      ingestUrl: INGEST_URL,
      apiKey,
      endpoints,
      edges,
    });
    console.log(
      `[agent] Upserted ${endpoints.length} endpoint delta(s), ${edges.length} edge(s) for ${serviceId}`,
      result?.upserted ?? '',
    );
  } catch (err) {
    console.error(`[agent] Ingest flush error (${serviceId}):`, err.message);
    requeueDeltas(bucket.aggregator, { endpoints, edges });
    scheduleFlush();
  }
}

async function flushToIngest() {
  const entries = [...buckets.entries()];
  for (const [serviceId, bucket] of entries) {
    await flushBucket(serviceId, bucket);
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agent', time: new Date().toISOString() });
});

/**
 * Proxy protect policy from ingest (API-key auth). Connectors poll ~every 15m.
 */
app.get('/v1/policy', async (req, res) => {
  const headerKey = req.headers['x-api-key'];
  const apiKey = typeof headerKey === 'string' ? headerKey : '';
  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }
  try {
    const url = `${INGEST_URL.replace(/\/$/, '')}/v1/auth/policy`;
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text || '{}');
  } catch (err) {
    console.error('[agent] Policy proxy error:', err.message);
    res.status(503).json({ error: 'Policy service unavailable' });
  }
});

/**
 * Accept a batch of samples.
 * Auth + rate limit before 202; process async into per-service aggregators.
 */
app.post('/v1/samples', async (req, res) => {
  const headerKey = req.headers['x-api-key'];
  const apiKey =
    (typeof headerKey === 'string' && headerKey) ||
    (typeof req.body?.apiKey === 'string' && req.body.apiKey) ||
    '';

  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  let identity;
  try {
    identity = await keyResolver.resolve(apiKey);
  } catch (err) {
    console.error('[agent] Introspect transport error:', err.message);
    res.status(503).json({ error: 'Auth service unavailable' });
    return;
  }

  if (!identity) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  if (!rateLimiter.allow(apiKey)) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const check = validateEnvelope(req.body);
  if (!check.ok) {
    res.status(400).json({ error: check.error });
    return;
  }

  const serviceId = identity.serviceId;
  res.status(202).json({ accepted: req.body.samples.length });

  setImmediate(() => {
    try {
      const bucket = getBucket(serviceId, apiKey);
      for (const sample of req.body.samples) {
        bucket.aggregator.ingestSample(sample);
        if (DEBUG_BUFFER) {
          debugRing.push({
            at: new Date().toISOString(),
            serviceId,
            method: sample.method,
            path: sample.path,
          });
          if (debugRing.length > DEBUG_MAX) debugRing.shift();
        }
      }
      scheduleFlush();
    } catch (err) {
      console.error('[agent] Process error:', err);
    }
  });
});

if (DEBUG_BUFFER) {
  app.get('/debug/ring', (_req, res) => {
    res.json({ samples: debugRing });
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[agent] Listening on :${PORT}`);
  console.log(`[agent] Ingest URL: ${INGEST_URL}`);
  console.log(`[agent] Debug buffer: ${DEBUG_BUFFER}`);
  console.log(`[agent] Rate limit: ${RATE_MAX}/${RATE_WINDOW_MS}ms`);
});
