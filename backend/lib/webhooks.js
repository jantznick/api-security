/**
 * Fire-and-forget outbound webhooks (SF2/SF6). Never throws to callers.
 */

/**
 * @param {string|null|undefined} url
 * @param {object} payload
 */
export async function postWebhook(url, payload) {
  if (!url || typeof url !== 'string') return { ok: false, skipped: true };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Slack incoming webhook — simple text message.
 */
export async function postSlackWebhook(url, text) {
  if (!url) return { ok: false, skipped: true };
  return postWebhook(url, { text: String(text || '').slice(0, 3000) });
}
