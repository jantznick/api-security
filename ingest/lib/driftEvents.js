/**
 * SF2 — inventory drift event helpers (ingest upsert path).
 * Detects endpoint.discovered, signal.appeared, auth.regressed.
 * Webhook delivery is fire-and-forget and fail-open.
 */

const STRONG_AUTH = new Set(['bearer', 'cookie']);

/**
 * @param {unknown} modes
 * @returns {string[]}
 */
export function normalizeAuthModes(modes) {
  if (!Array.isArray(modes)) return [];
  return [...new Set(modes.map((m) => String(m || '').toLowerCase()).filter(Boolean))];
}

/**
 * True when previous stored modes included bearer/cookie and this sample is only `none`,
 * and the endpoint already had traffic (hitCount > 0).
 * @param {{ prevAuth: string[], sampleAuth: string[], hitCount: number }} args
 */
export function isAuthRegression({ prevAuth, sampleAuth, hitCount }) {
  const prev = normalizeAuthModes(prevAuth);
  const sample = normalizeAuthModes(sampleAuth);
  if (!hitCount || hitCount <= 0) return false;
  if (!prev.some((m) => STRONG_AUTH.has(m))) return false;
  if (sample.length === 0) return false;
  // Sample must be exclusively none (no bearer/cookie in this batch).
  return sample.every((m) => m === 'none');
}

/**
 * Resolve webhook URL: service override, else project.
 * @param {{ webhookUrl?: string | null, project?: { webhookUrl?: string | null } | null } | null} service
 */
export function resolveWebhookUrl(service) {
  const fromService = String(service?.webhookUrl || '').trim();
  if (fromService) return fromService;
  const fromProject = String(service?.project?.webhookUrl || '').trim();
  return fromProject || null;
}

/**
 * Fire-and-forget POST. Never throws to caller; swallows network/HTTP errors.
 * @param {string | null | undefined} url
 * @param {object} event
 */
export function deliverWebhook(url, event) {
  if (!url) return;
  const body = JSON.stringify({
    id: event.id,
    serviceId: event.serviceId,
    endpointId: event.endpointId ?? null,
    type: event.type,
    payload: event.payload ?? {},
    createdAt: event.createdAt,
  });

  Promise.resolve()
    .then(() =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'API-Glimpse-Drift/1.0',
        },
        body,
        signal: AbortSignal.timeout(8000),
      }),
    )
    .then((res) => {
      if (!res.ok) {
        console.warn(`Drift webhook non-OK ${res.status} for ${event.type}`);
      }
    })
    .catch((err) => {
      console.warn(`Drift webhook failed for ${event.type}:`, err?.message || err);
    });
}

/**
 * Persist an InventoryEvent and optionally notify webhook.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ serviceId: string, endpointId?: string | null, type: string, payload?: object, webhookUrl?: string | null }} args
 */
export async function recordInventoryEvent(prisma, args) {
  const event = await prisma.inventoryEvent.create({
    data: {
      serviceId: args.serviceId,
      endpointId: args.endpointId ?? null,
      type: args.type,
      payload: args.payload ?? {},
    },
  });
  deliverWebhook(args.webhookUrl, event);
  return event;
}
