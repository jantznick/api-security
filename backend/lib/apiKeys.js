import crypto from 'crypto';

export function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

/**
 * Generate a project API key. Returns { raw, hash, prefix }.
 * Raw is shown once to the user; only hash is stored.
 */
export function generateApiKey() {
  const raw = `ask_${crypto.randomBytes(24).toString('hex')}`;
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: raw.slice(0, 12),
  };
}
