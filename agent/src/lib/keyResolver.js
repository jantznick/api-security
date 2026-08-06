/**
 * Resolve project API keys via ingest introspect, with a short TTL cache.
 * Invalid keys are not cached as valid; brief negative cache reduces stampede.
 */

const DEFAULT_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 5_000;

export function createKeyResolver({ ingestUrl, ttlMs = DEFAULT_TTL_MS, fetchImpl = fetch }) {
  /** @type {Map<string, { expiresAt: number, value: object | null }>} */
  const cache = new Map();

  async function introspect(apiKey) {
    const url = `${ingestUrl.replace(/\/$/, '')}/v1/auth/introspect`;
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (res.status === 401 || res.status === 403) {
      return null;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Introspect failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  /**
   * @param {string} apiKey
   * @returns {Promise<{ projectId: string, projectName?: string, apiKeyId?: string, apiKey: string } | null>}
   */
  async function resolve(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') return null;

    const cached = cache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    let identity;
    try {
      identity = await introspect(apiKey);
    } catch (err) {
      // Don't cache transport errors as invalid — allow retry
      throw err;
    }

    if (!identity?.projectId) {
      cache.set(apiKey, { expiresAt: Date.now() + NEGATIVE_TTL_MS, value: null });
      return null;
    }

    const value = {
      projectId: identity.projectId,
      projectName: identity.projectName,
      apiKeyId: identity.apiKeyId,
      apiKey,
    };
    cache.set(apiKey, { expiresAt: Date.now() + ttlMs, value });
    return value;
  }

  function clear() {
    cache.clear();
  }

  return { resolve, clear };
}
