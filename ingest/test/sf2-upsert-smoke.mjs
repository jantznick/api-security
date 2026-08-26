/**
 * Smoke: create service → upsert new endpoint → expect endpoint.discovered event.
 * Requires DATABASE_URL. Uses Prisma directly + Express app mount if INGEST_URL unset.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

async function main() {
  const email = `sf2-smoke-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: { email, password: null, planSlug: 'free' },
  });
  const org = await prisma.organization.create({
    data: {
      name: 'SF2 Smoke',
      slug: `sf2-smoke-${Date.now()}`,
      isPersonal: true,
      planSlug: 'free',
      memberships: { create: { userId: user.id, role: 'owner' } },
      projects: { create: { name: 'Default' } },
    },
    include: { projects: true },
  });
  const project = org.projects[0];
  const rawKey = `ask_sf2_${crypto.randomBytes(16).toString('hex')}`;
  const service = await prisma.service.create({
    data: {
      name: 'SF2 Demo',
      projectId: project.id,
      apiKeys: {
        create: {
          name: 'default',
          keyHash: hashApiKey(rawKey),
          keyPrefix: rawKey.slice(0, 8),
        },
      },
    },
  });

  const ingestUrl = process.env.INGEST_URL || 'http://127.0.0.1:3002';
  const pathTemplate = `/sf2/new-route-${Date.now()}`;
  const res = await fetch(`${ingestUrl}/inventory/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': rawKey,
    },
    body: JSON.stringify({
      endpoints: [
        {
          method: 'GET',
          pathTemplate,
          hitCount: 1,
          authModes: ['none'],
          statusCodes: { '200': 1 },
          signals: [],
        },
      ],
    }),
  });
  const body = await res.json();
  console.log('upsert status', res.status, body);

  const events = await prisma.inventoryEvent.findMany({
    where: { serviceId: service.id, type: 'endpoint.discovered' },
    orderBy: { createdAt: 'desc' },
  });
  console.log('events', JSON.stringify(events, null, 2));

  if (!res.ok || !body.events || body.events < 1 || events.length < 1) {
    throw new Error('Expected endpoint.discovered event after upsert');
  }
  console.log('sf2-upsert-smoke: ok');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
