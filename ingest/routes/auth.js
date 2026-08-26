import express from 'express';
import { requireApiKey } from '../middleware/apiKey.js';

const router = express.Router();

/**
 * Validate a service API key. Used by the hosted agent (private network).
 * Returns service identity only — never echoes the key.
 */
router.get('/introspect', requireApiKey, (req, res) => {
  const service = req.service || req.project;
  res.json({
    ok: true,
    serviceId: service.id,
    serviceName: service.name,
    /** @deprecated aliases for transitional agent builds */
    projectId: service.id,
    projectName: service.name,
    apiKeyId: req.apiKeyId,
  });
});

export default router;
