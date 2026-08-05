import 'dotenv/config';
import express from 'express';
import { apiSensor } from '@api-security/middleware';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(express.json());

app.use(
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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'demo-app' });
});

app.get('/api/users', (_req, res) => {
  res.json({ users });
});

app.get('/api/users/:id', (req, res) => {
  const user = users.find((u) => String(u.id) === String(req.params.id));
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

app.post('/api/users', (req, res) => {
  const { email, name, phone, password, ssn } = req.body || {};
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
  res.status(201).json({ user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'email and password required' });
    return;
  }
  res.json({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature',
    user: { email },
  });
});

app.get('/api/orders/:orderId/items/:itemId', (req, res) => {
  res.json({
    orderId: req.params.orderId,
    itemId: req.params.itemId,
    sku: 'SKU-100',
    qty: 2,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Demo Express app on :${PORT}`);
  console.log(`Sensor → ${process.env.API_SENSOR_AGENT_URL || 'http://localhost:8080'}`);
});
