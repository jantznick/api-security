import express from 'express';
import prisma from '../lib/prisma.js';
import { generateApiKey } from '../lib/apiKeys.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrgEndpointLimit } from '../lib/plans.js';
import {
  accessibleProject,
  accessibleService,
  ensurePersonalOrg,
  memberOrgIds,
} from '../lib/orgs.js';

const router = express.Router();

router.use(requireAuth);

const apiKeySelect = {
  id: true,
  name: true,
  keyPrefix: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
};

const serviceListInclude = {
  apiKeys: {
    where: { revokedAt: null },
    select: apiKeySelect,
  },
  _count: { select: { endpoints: true } },
};

function serializeService(service) {
  return {
    id: service.id,
    name: service.name,
    projectId: service.projectId,
    projectName: service.project?.name,
    organizationId: service.project?.organizationId ?? service.project?.organization?.id,
    endpointLimit: service.endpointLimit,
    webhookUrl: service.webhookUrl ?? null,
    protectEnabled: Boolean(service.protectEnabled),
    protectMode: service.protectMode || 'observe',
    protectRule: service.protectRule ?? null,
    protectVersion: Number(service.protectVersion) || 1,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    apiKeys: service.apiKeys,
    _count: service._count,
  };
}

/** Allow http(s) URLs only; empty clears. */
function normalizeWebhookUrl(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: 'webhookUrl must be a valid URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'webhookUrl must use http or https' };
  }
  return { value: trimmed };
}

async function loadUserForOrg(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      planSlug: true,
      stripeSubscriptionId: true,
    },
  });
}

async function createServiceInDefaultProject(userId, name) {
  const user = await loadUserForOrg(userId);
  if (!user) throw new Error('Unauthorized');
  const { organization, project } = await ensurePersonalOrg(user);
  const key = generateApiKey();
  const endpointLimit = await resolveOrgEndpointLimit(organization);

  const service = await prisma.service.create({
    data: {
      name: String(name || '').trim() || 'Default service',
      projectId: project.id,
      endpointLimit,
      apiKeys: {
        create: {
          name: 'default',
          keyHash: key.hash,
          keyPrefix: key.prefix,
        },
      },
    },
    include: {
      apiKeys: {
        where: { revokedAt: null },
        select: apiKeySelect,
      },
      project: { select: { id: true, name: true, organizationId: true } },
      _count: { select: { endpoints: true } },
    },
  });

  return { service: serializeService(service), apiKey: key.raw, project };
}

/**
 * GET /api/projects — list Projects across membership orgs (with nested services).
 */
router.get('/', async (req, res) => {
  try {
    const orgIds = await memberOrgIds(req.session.userId);
    const projects = await prisma.project.findMany({
      where: { organizationId: { in: orgIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true, slug: true, isPersonal: true } },
        services: {
          orderBy: { createdAt: 'desc' },
          include: serviceListInclude,
        },
        _count: { select: { services: true } },
      },
    });
    res.json({ projects });
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

/**
 * POST /api/projects — create a Project in the user's personal org.
 * Body: { name }
 * Transitional: { asService: true } creates a Service under Default project (+ API key),
 * matching old "create project = inventoring unit" UX.
 */
router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim() || 'New project';
    const asService = Boolean(req.body?.asService ?? true);

    // Default: creating from the dashboard still mints a service (API unit) under Default.
    // Pass asService: false to create a grouping Project only.
    if (asService) {
      const result = await createServiceInDefaultProject(req.session.userId, name);
      return res.status(201).json({
        service: result.service,
        project: result.project,
        /** Shown once — store in agent / middleware env */
        apiKey: result.apiKey,
        /** @deprecated transitional alias for clients expecting { project, apiKey } */
        legacyProject: result.service,
      });
    }

    const user = await loadUserForOrg(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { organization } = await ensurePersonalOrg(user);
    const project = await prisma.project.create({
      data: {
        name,
        organizationId: organization.id,
      },
      include: {
        organization: { select: { id: true, name: true, slug: true, isPersonal: true } },
        services: true,
        _count: { select: { services: true } },
      },
    });
    res.status(201).json({ project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * GET /api/projects/:projectId — project detail with services.
 * Compatibility: if :projectId matches a Service id (legacy bookmark), return
 * { legacy: true, service } so clients can redirect.
 */
router.get('/:projectId', async (req, res) => {
  try {
    const project = await accessibleProject(req.params.projectId, req.session.userId);
    if (project) {
      const full = await prisma.project.findUnique({
        where: { id: project.id },
        include: {
          organization: { select: { id: true, name: true, slug: true, isPersonal: true } },
          services: {
            orderBy: { createdAt: 'desc' },
            include: serviceListInclude,
          },
          _count: { select: { services: true } },
        },
      });
      return res.json({ project: full });
    }

    // Legacy: old Project UUIDs are now Service ids
    const service = await accessibleService(req.params.projectId, req.session.userId);
    if (service) {
      return res.json({
        legacy: true,
        service: serializeService(service),
        /** @deprecated use service — kept for transitional clients */
        project: serializeService(service),
      });
    }

    return res.status(404).json({ error: 'Project not found' });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

/**
 * POST /api/projects/:projectId/services — create a Service (+ default API key).
 */
router.post('/:projectId/services', async (req, res) => {
  try {
    const project = await accessibleProject(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const name = String(req.body?.name || '').trim() || 'Default service';
    const key = generateApiKey();

    const org = await prisma.organization.findUnique({
      where: { id: project.organizationId },
      select: {
        id: true,
        planSlug: true,
        endpointLimit: true,
        planAssignedAt: true,
      },
    });
    const endpointLimit = await resolveOrgEndpointLimit(org);

    const service = await prisma.service.create({
      data: {
        name,
        projectId: project.id,
        endpointLimit,
        apiKeys: {
          create: {
            name: 'default',
            keyHash: key.hash,
            keyPrefix: key.prefix,
          },
        },
      },
      include: {
        apiKeys: {
          where: { revokedAt: null },
          select: apiKeySelect,
        },
        project: { select: { id: true, name: true, organizationId: true } },
        _count: { select: { endpoints: true } },
      },
    });

    res.status(201).json({
      service: serializeService(service),
      apiKey: key.raw,
    });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

/**
 * GET /api/projects/:projectId/services — list services in a project.
 */
router.get('/:projectId/services', async (req, res) => {
  try {
    const project = await accessibleProject(req.params.projectId, req.session.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const services = await prisma.service.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      include: {
        ...serviceListInclude,
        project: { select: { id: true, name: true, organizationId: true } },
      },
    });

    res.json({ services: services.map(serializeService) });
  } catch (error) {
    console.error('List services error:', error);
    res.status(500).json({ error: 'Failed to list services' });
  }
});

/**
 * GET /api/projects/:projectId/services/:serviceId
 */
router.get('/:projectId/services/:serviceId', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service || service.projectId !== req.params.projectId) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json({ service: serializeService(service) });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ error: 'Failed to get service' });
  }
});

/**
 * PATCH /api/projects/:projectId/services/:serviceId
 * Body: { webhookUrl?, protectEnabled?, protectMode?, protectRule? }
 */
router.patch('/:projectId/services/:serviceId', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service || service.projectId !== req.params.projectId) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const data = {};
    let bumpProtectVersion = false;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'webhookUrl')) {
      const normalized = normalizeWebhookUrl(req.body.webhookUrl);
      if (normalized?.error) {
        return res.status(400).json({ error: normalized.error });
      }
      data.webhookUrl = normalized === undefined ? undefined : normalized.value ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'protectEnabled')) {
      data.protectEnabled = Boolean(req.body.protectEnabled);
      bumpProtectVersion = true;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'protectMode')) {
      const mode = String(req.body.protectMode || '').toLowerCase();
      if (mode !== 'observe' && mode !== 'block') {
        return res.status(400).json({ error: 'protectMode must be observe or block' });
      }
      data.protectMode = mode;
      bumpProtectVersion = true;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'protectRule')) {
      const rule = req.body.protectRule;
      if (rule !== null && rule !== undefined && rule !== '' && rule !== 'deny_unauth_sensitive') {
        return res.status(400).json({
          error: 'protectRule must be null or deny_unauth_sensitive',
        });
      }
      data.protectRule = rule ? 'deny_unauth_sensitive' : null;
      bumpProtectVersion = true;
    }
    if (bumpProtectVersion) {
      data.protectVersion = { increment: 1 };
    }

    if (Object.keys(data).length === 0) {
      return res.json({ service: serializeService(service) });
    }

    const updated = await prisma.service.update({
      where: { id: service.id },
      data,
      include: {
        apiKeys: {
          orderBy: { createdAt: 'desc' },
          select: apiKeySelect,
        },
        project: { select: { id: true, name: true, organizationId: true } },
        _count: { select: { endpoints: true } },
      },
    });

    res.json({ service: serializeService(updated) });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

router.post('/:projectId/services/:serviceId/api-keys', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service || service.projectId !== req.params.projectId) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const key = generateApiKey();
    const name = String(req.body?.name || 'default').trim() || 'default';

    const apiKey = await prisma.apiKey.create({
      data: {
        serviceId: service.id,
        name,
        keyHash: key.hash,
        keyPrefix: key.prefix,
      },
      select: apiKeySelect,
    });

    res.status(201).json({ apiKey, rawKey: key.raw });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.post('/:projectId/services/:serviceId/api-keys/:keyId/revoke', async (req, res) => {
  try {
    const service = await accessibleService(req.params.serviceId, req.session.userId);
    if (!service || service.projectId !== req.params.projectId) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const existing = await prisma.apiKey.findFirst({
      where: { id: req.params.keyId, serviceId: service.id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'API key not found' });
    }
    if (existing.revokedAt) {
      return res.json({
        apiKey: {
          id: existing.id,
          name: existing.name,
          keyPrefix: existing.keyPrefix,
          createdAt: existing.createdAt,
          lastUsedAt: existing.lastUsedAt,
          revokedAt: existing.revokedAt,
        },
      });
    }

    const apiKey = await prisma.apiKey.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
      select: apiKeySelect,
    });

    res.json({ apiKey });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export default router;
