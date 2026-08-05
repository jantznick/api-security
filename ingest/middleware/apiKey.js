import crypto from 'crypto';
import prisma from '../lib/prisma.js';

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

/**
 * Resolve project from X-API-Key header. Never stores or logs the raw key.
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
      include: { project: true },
    });

    if (!apiKey) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    req.project = apiKey.project;
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
