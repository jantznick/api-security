import 'dotenv/config';
import express from 'express';
import { validateEnvelope } from '@apiglimpse/shared';
import { InventoryAggregator } from './pipeline/aggregate.js';
import { upsertInventory } from './lib/ingestClient.js';

const PORT = Number(process.env.PORT || 8080);
const INGEST_URL = process.env.INGEST_URL || 'http://localhost:3002';
const INGEST_API_KEY = process.env.INGEST_API_KEY || '';
const DEBUG_BUFFER = process.env.AGENT_DEBUG_BUFFER === 'true';
const FLUSH_MS = Number(process.env.AGENT_FLUSH_MS || 2000);

const app = express();
app.use(express.json({ limit: '2mb' }));

const aggregator = new InventoryAggregator();
const debugRing = [];
const DEBUG_MAX = 50;
let pendingApiKey = INGEST_API_KEY;
let flushTimer = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushToIngest();
  }, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

async function flushToIngest() {
  const deltas = aggregator.drain();
  if (!deltas.length) return;

  const apiKey = pendingApiKey || INGEST_API_KEY;
  if (!apiKey || apiKey === 'dev-ingest-key-replace-me') {
    console.warn(
      `[agent] Skipping ingest flush (${deltas.length} endpoints) — set INGEST_API_KEY`,
    );
    // Re-queue? For POC we log and drop if no key; samples already processed in memory.
    return;
  }

  try {
    const result = await upsertInventory({
      ingestUrl: INGEST_URL,
      apiKey,
      endpoints: deltas,
    });
    console.log(`[agent] Upserted ${deltas.length} endpoint delta(s)`, result?.upserted ?? '');
  } catch (err) {
    console.error('[agent] Ingest flush error:', err.message);
    // Re-queue deltas with internal Set shapes for a later retry
    for (const d of deltas) {
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
    scheduleFlush();
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agent', time: new Date().toISOString() });
});

/**
 * Accept a batch of samples. Respond 202 immediately; process async.
 */
app.post('/v1/samples', (req, res) => {
  const headerKey = req.headers['x-api-key'];
  if (headerKey && typeof headerKey === 'string') {
    pendingApiKey = headerKey;
  }

  const check = validateEnvelope(req.body);
  if (!check.ok) {
    res.status(400).json({ error: check.error });
    return;
  }

  // 202 first — never block the middleware flush on processing
  res.status(202).json({ accepted: req.body.samples.length });

  setImmediate(() => {
    try {
      for (const sample of req.body.samples) {
        aggregator.ingestSample(sample);
        if (DEBUG_BUFFER) {
          debugRing.push({
            at: new Date().toISOString(),
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
});
