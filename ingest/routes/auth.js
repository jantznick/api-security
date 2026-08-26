import express from 'express';
import { requireApiKey } from '../middleware/apiKey.js';

const router = express.Router();

/**
 * Validate API key and return service identity (+ protect policy for connectors).
 */
router.get('/introspect', requireApiKey, (req, res) => {
  const service = req.service || req.project;
  res.json({
    serviceId: service.id,
    serviceName: service.name,
    /** @deprecated alias */
    projectId: service.id,
    projectName: service.name,
    apiKeyId: req.apiKeyId,
    protect: {
      enabled: Boolean(service.protectEnabled),
      mode: service.protectMode || 'observe',
      /** Single MVP rule — deny requests with no auth on paths matching this pattern */
      rule: service.protectRule || null,
      version: Number(service.protectVersion) || 1,
    },
  });
});

/**
 * Lightweight policy fetch for connectors (same auth as samples).
 * Connectors poll every ~15 minutes or after version change notification.
 */
router.get('/policy', requireApiKey, (req, res) => {
  const service = req.service || req.project;
  res.json({
    serviceId: service.id,
    version: Number(service.protectVersion) || 1,
    enabled: Boolean(service.protectEnabled),
    mode: service.protectMode || 'observe',
    rule: service.protectRule || null,
    /**
     * MVP: one built-in rule shape when rule === 'deny_unauth_sensitive'
     * Match: any path containing /admin|/auth|/users|/billing and authModes none → deny
     */
    rules:
      service.protectEnabled && service.protectRule === 'deny_unauth_sensitive'
        ? [
            {
              id: 'deny_unauth_sensitive',
              match: {
                pathTemplate: '**/(admin|auth|login|users|billing|payment)/**',
                authModes: ['none'],
              },
              action: 'deny',
            },
          ]
        : [],
    fetchedAt: new Date().toISOString(),
  });
});

export default router;
