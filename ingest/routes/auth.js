import express from 'express';
import { requireApiKey } from '../middleware/apiKey.js';

const router = express.Router();

/**
 * Validate a project API key. Used by the hosted agent (private network).
 * Returns project identity only — never echoes the key.
 */
router.get('/introspect', requireApiKey, (req, res) => {
  res.json({
    ok: true,
    projectId: req.project.id,
    projectName: req.project.name,
    apiKeyId: req.apiKeyId,
  });
});

export default router;
