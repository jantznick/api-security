/**
 * Push inventory deltas to the ingest API (API-key auth).
 */

export async function upsertInventory({ ingestUrl, apiKey, endpoints }) {
  if (!endpoints?.length) {
    return { ok: true, skipped: true };
  }

  const url = `${ingestUrl.replace(/\/$/, '')}/v1/inventory/upsert`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ endpoints }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ingest upsert failed (${res.status}): ${text}`);
  }

  return res.json();
}
