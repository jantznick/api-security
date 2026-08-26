/**
 * SF6 integrations + SF7 protect policy suggestions (service-scoped).
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { accessibleService } from '../lib/orgs.js';
import { sendIntegrationTest } from '../lib/webhooks.js';
import { buildPolicySuggestions } from '../lib/policySuggestions.js';

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

function normalizeUrl(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    throw new Error('URL must start with http:// or https://');
  }
  return s;
}

async function loadServiceForIntegrations(serviceId, userId) {
  const accessible = await accessibleService(serviceId, userId);
  if (!accessible) return null;
  return prisma.service.findUnique({
    where: { id: accessible.id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          webhookUrl: true,
          slackWebhookUrl: true,
        },
      },
    },
  });
}

function serializeIntegrations(service) {
  return {
    webhookUrl: service.webhookUrl || null,
    slackWebhookUrl: service.slackWebhookUrl || null,
    projectWebhookUrl: service.project?.webhookUrl || null,
    projectSlackWebhookUrl: service.project?.slackWebhookUrl || null,
    effectiveWebhookUrl: service.webhookUrl || service.project?.webhookUrl || null,
    effectiveSlackWebhookUrl:
      service.slackWebhookUrl || service.project?.slackWebhookUrl || null,
  };
}

/**
 * GET /api/services/:serviceId/integrations
 */
router.get('/integrations', async (req, res) => {
  try {
    const service = await loadServiceForIntegrations(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({ integrations: serializeIntegrations(service) });
  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({ error: 'Failed to get integrations' });
  }
});

/**
 * PATCH /api/services/:serviceId/integrations
 * Body: { webhookUrl?, slackWebhookUrl? } — empty string clears.
 */
router.patch('/integrations', async (req, res) => {
  try {
    const service = await loadServiceForIntegrations(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const data = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'webhookUrl')) {
      try {
        data.webhookUrl = normalizeUrl(req.body.webhookUrl);
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Invalid webhookUrl' });
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'slackWebhookUrl')) {
      try {
        data.slackWebhookUrl = normalizeUrl(req.body.slackWebhookUrl);
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Invalid slackWebhookUrl' });
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No integration fields to update' });
    }

    const updated = await prisma.service.update({
      where: { id: service.id },
      data,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            webhookUrl: true,
            slackWebhookUrl: true,
          },
        },
      },
    });

    res.json({ integrations: serializeIntegrations(updated) });
  } catch (error) {
    console.error('Update integrations error:', error);
    res.status(500).json({ error: 'Failed to update integrations' });
  }
});

/**
 * POST /api/services/:serviceId/integrations/webhook/test
 */
router.post('/integrations/webhook/test', async (req, res) => {
  try {
    const service = await loadServiceForIntegrations(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const result = await sendIntegrationTest({
      service,
      project: service.project,
      channel: 'webhook',
    });
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Webhook test failed', result });
    }
    res.json({ ok: true, result });
  } catch (error) {
    console.error('Webhook test error:', error);
    res.status(500).json({ error: 'Failed to send webhook test' });
  }
});

/**
 * POST /api/services/:serviceId/integrations/slack/test
 */
router.post('/integrations/slack/test', async (req, res) => {
  try {
    const service = await loadServiceForIntegrations(req.params.serviceId, req.session.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const result = await sendIntegrationTest({
      service,
      project: service.project,
      channel: 'slack',
    });
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Slack test failed', result });
    }
    res.json({ ok: true, result });
  } catch (error) {
    console.error('Slack test error:', error);
    res.status(500).json({ error: 'Failed to send Slack test' });
  }
});

/**
 * GET /api/services/:serviceId/policy-suggestions
 * SF7 phase 1 — checklist suggestions (not blocking).
 */
router.get('/policy-suggestions', async (req, res) => {
  try {
    const accessible = await accessibleService(req.params.serviceId, req.session.userId);
    if (!accessible) return res.status(404).json({ error: 'Service not found' });

    const endpoints = await prisma.endpoint.findMany({
      where: { serviceId: accessible.id },
      include: {
        signals: {
          orderBy: [{ severity: 'asc' }, { fieldPath: 'asc' }],
        },
      },
      orderBy: [{ pathTemplate: 'asc' }, { method: 'asc' }],
    });

    const { suggestions, summary } = buildPolicySuggestions(endpoints);
    res.json({
      serviceId: accessible.id,
      mode: 'suggestions',
      blocking: false,
      summary,
      suggestions,
    });
  } catch (error) {
    console.error('Policy suggestions error:', error);
    res.status(500).json({ error: 'Failed to build policy suggestions' });
  }
});

/**
 * GET /api/services/:serviceId/protect/policy
 * Stub policy document for middleware cache pull (PM1/PM2).
 * Returns empty rules until a policy editor ships — fail-open.
 */
router.get('/protect/policy', async (req, res) => {
  try {
    const accessible = await accessibleService(req.params.serviceId, req.session.userId);
    if (!accessible) return res.status(404).json({ error: 'Service not found' });

    const endpoints = await prisma.endpoint.findMany({
      where: { serviceId: accessible.id },
      include: { signals: true },
    });
    const { suggestions } = buildPolicySuggestions(endpoints);

    // Stub: expose proposed rules for observe/block experiments; customers must enable protect locally.
    const rules = suggestions.map((s) => s.proposedRule);

    res.json({
      version: 1,
      fetchedAt: new Date().toISOString(),
      serviceId: accessible.id,
      failMode: 'open',
      rules,
    });
  } catch (error) {
    console.error('Protect policy error:', error);
    res.status(500).json({ error: 'Failed to fetch protect policy' });
  }
});

export default router;
