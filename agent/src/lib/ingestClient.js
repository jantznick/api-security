/**
 * Push inventory deltas (+ optional topology edges) to the ingest API (API-key auth).
 */

export async function upsertInventory({ ingestUrl, apiKey, endpoints, edges }) {
  if (!endpoints?.length && !edges?.length) {
    return { ok: true, skipped: true };
  }

  const url = `${ingestUrl.replace(/\/$/, '')}/v1/inventory/upsert`;
  const body = { endpoints: endpoints || [] };
  if (Array.isArray(edges) && edges.length > 0) {
    body.edges = edges;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ingest upsert failed (${res.status}): ${text}`);
  }

  return res.json();
}
