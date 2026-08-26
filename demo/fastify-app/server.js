import 'dotenv/config';
import Fastify from 'fastify';
import { apiSensor } from '@apiglimpse/fastify';

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 4001);

await app.register(
  apiSensor({
    agentUrl: process.env.API_SENSOR_AGENT_URL || 'http://localhost:8080',
    apiKey: process.env.API_SENSOR_KEY || '',
    sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
  }),
);

const users = [
  { id: 1, email: 'alice@example.com', name: 'Alice', phone: '555-0100' },
  { id: 2, email: 'bob@example.com', name: 'Bob', phone: '555-0101' },
];

app.get('/health', async () => ({ status: 'ok', service: 'demo-fastify-app' }));

app.get('/api/users', async () => ({ users }));

app.get('/api/users/:id', async (request, reply) => {
  const user = users.find((u) => String(u.id) === String(request.params.id));
  if (!user) {
    return reply.code(404).send({ error: 'User not found' });
  }
  return { user };
});

app.post('/api/users', async (request, reply) => {
  const { email, name, phone, password, ssn } = request.body || {};
  const user = {
    id: users.length + 1,
    email,
    name,
    phone,
    // Echo shape only for discovery demo — do not do this in real apps
    hasPassword: Boolean(password),
    hasSsn: Boolean(ssn),
  };
  users.push({ id: user.id, email, name, phone });
  return reply.code(201).send({ user });
});

app.post('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) {
    return reply.code(400).send({ error: 'email and password required' });
  }
  return {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature',
    user: { email },
  };
});

app.get('/api/orders/:orderId/items/:itemId', async (request) => ({
  orderId: request.params.orderId,
  itemId: request.params.itemId,
  sku: 'SKU-100',
  qty: 2,
}));

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Demo Fastify app on :${PORT}`);
  console.log(`Sensor → ${process.env.API_SENSOR_AGENT_URL || 'http://localhost:8080'}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
