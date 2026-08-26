import 'dotenv/config';
import express from 'express';
import { apiSensor } from '@apiglimpse/middleware';

const app = express();
const PORT = Number(process.env.PORT || 4014);
const SERVICE = process.env.API_SENSOR_SERVICE_NAME || 'ledger-api';

app.use(express.json());

app.use(
  apiSensor({
    agentUrl: process.env.API_SENSOR_AGENT_URL || 'http://localhost:8080',
    apiKey: process.env.API_SENSOR_KEY || '',
    sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
    serviceName: SERVICE,
  }),
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE });
});

app.post('/api/ledger/entries', (req, res) => {
  const { accountId, amount, token, orderId } = req.body || {};
  res.status(201).json({
    entryId: `le_${Date.now()}`,
    accountId: accountId || 'acct_demo_001',
    amount: amount ?? 99.99,
    orderId: orderId || 'ord_demo',
    token: token || 'sk_live_demo_4111111111111111',
    status: 'posted',
  });
});

/** Shadow route — no auth, bulk PII-shaped export for demo classification gaps. */
app.post('/internal/debug/export', (req, res) => {
  const { format = 'json' } = req.body || {};
  res.json({
    format,
    exportedAt: new Date().toISOString(),
    records: [
      {
        email: 'alice@example.com',
        ssn: '000-00-0000',
        phone: '555-0100',
        cardLast4: '1111',
        pan: '4111111111111111',
        apiToken: 'sk_live_demo_export_secret',
      },
      {
        email: 'bob@example.com',
        ssn: '123-45-6789',
        phone: '555-0101',
        cardLast4: '4242',
        pan: '4242424242424242',
        apiToken: 'sk_live_demo_export_secret_2',
      },
    ],
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Acme ledger-api on :${PORT}`);
});
