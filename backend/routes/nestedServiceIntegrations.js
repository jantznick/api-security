/**
 * Nested service integration routes under /api/projects/:projectId/services/:serviceId
 * Re-exports the same handlers as flat /api/services/:serviceId/* after projectId check.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { accessibleService } from '../lib/orgs.js';
import serviceIntegrations from './serviceIntegrations.js';

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

router.use(async (req, res, next) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service || (req.params.projectId && service.projectId !== req.params.projectId)) {
      return res.status(404).json({ error: 'Service not found' });
    }
    next();
  } catch (error) {
    console.error('Nested service gate error:', error);
    res.status(500).json({ error: 'Failed to authorize service' });
  }
});

router.use(serviceIntegrations);

export default router;
