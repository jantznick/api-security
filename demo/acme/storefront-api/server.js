import 'dotenv/config';
import express from 'express';
import { apiSensor } from '@apiglimpse/middleware';

const app = express();
const PORT = Number(process.env.PORT || 4011);
const SERVICE = process.env.API_SENSOR_SERVICE_NAME || 'storefront-api';
const COMMERCE_URL = (process.env.COMMERCE_URL || 'http://commerce-api:4012').replace(/\/$/, '');

app.use(express.json());

app.use(
  apiSensor({
    agentUrl: process.env.API_SENSOR_AGENT_URL || 'http://localhost:8080',
    apiKey: process.env.API_SENSOR_KEY || '',
    sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
    serviceName: SERVICE,
  }),
);

function outboundHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Service-Name': SERVICE,
  };
}

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: outboundHeaders(),
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: resp.status, data };
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'email and password required' });
    return;
  }
  res.json({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.acme.demo.signature',
    user: { email },
  });
});

app.get('/api/catalog', (_req, res) => {
  res.json({
    products: [
      { sku: 'SKU-100', name: 'Demo Hoodie', price: 49.99 },
      { sku: 'SKU-200', name: 'Demo Mug', price: 12.99 },
    ],
  });
});

app.post('/api/webhooks/billing', (req, res) => {
  const { partnerId, invoiceId, amount } = req.body || {};
  res.json({
    received: true,
    partnerId: partnerId || 'partner_demo',
    invoiceId: invoiceId || 'inv_demo',
    amount: amount ?? 199.0,
  });
});

/** Shadow edge — not in baseline topology (SF9 drift demo). */
app.get('/api/pricing/legacy', (_req, res) => {
  res.json({
    source: 'legacy-pricing-stub',
    multiplier: 1.05,
    note: 'Undocumented pricing dependency',
  });
});

app.post('/api/checkout', async (req, res) => {
  const {
    email = 'alice@example.com',
    amount = 99.99,
    cardPan = '4111111111111111',
    skipFulfillment = false,
    triggerShadowExport = false,
  } = req.body || {};

  try {
    await postJson(`${COMMERCE_URL}/api/users`, {
      email,
      name: 'Checkout User',
      phone: '555-0100',
      password: 'demo-password',
      ssn: '000-00-0000',
    });

    const checkout = await postJson(`${COMMERCE_URL}/api/checkout`, {
      email,
      amount,
      cardPan,
      skipFulfillment,
      triggerShadowExport,
    });

    if (checkout.status >= 400) {
      res.status(checkout.status).json(checkout.data);
      return;
    }

    res.json({
      status: 'ok',
      storefront: SERVICE,
      commerce: checkout.data,
    });
  } catch (err) {
    res.status(502).json({ error: 'checkout chain failed', detail: String(err) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Acme storefront-api on :${PORT}`);
});
