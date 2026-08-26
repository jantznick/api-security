import crypto from 'crypto';
import prisma from '../lib/prisma.js';

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

/**
 * Resolve service from X-API-Key header. Never stores or logs the raw key.
 */
export async function requireApiKey(req, res, next) {
  try {
    const raw =
      req.headers['x-api-key'] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!raw) {
      res.status(401).json({ error: 'API key required' });
      return;
    }

    const keyHash = hashApiKey(raw);
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { service: true },
    });

    if (!apiKey || apiKey.revokedAt) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    req.service = apiKey.service;
    /** @deprecated alias — Service is today's inventory unit */
    req.project = apiKey.service;
    req.apiKeyId = apiKey.id;

    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    next();
  } catch (error) {
    console.error('API key auth error:', error);
    res.status(500).json({ error: 'Auth failed' });
  }
}
