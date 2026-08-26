import 'dotenv/config';
import express from 'express';
import { apiSensor } from '@apiglimpse/middleware';

const app = express();
const PORT = Number(process.env.PORT || 4010);
const SERVICE = process.env.API_SENSOR_SERVICE_NAME || 'web-storefront';
const STOREFRONT_API_URL = (process.env.STOREFRONT_API_URL || 'http://storefront-api:4011').replace(/\/$/, '');

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

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Acme Retail Demo</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    button { padding: 0.5rem 1rem; margin-right: 0.5rem; }
    pre { background: #f4f4f4; padding: 1rem; overflow: auto; }
  </style>
</head>
<body>
  <h1>Acme Retail</h1>
  <p>Minimal web storefront — server-side checkout proxy to <code>storefront-api</code>.</p>
  <button id="login">Login</button>
  <button id="checkout">Checkout</button>
  <pre id="out">Ready.</pre>
  <script>
    const out = document.getElementById('out');
    const show = (label, data) => { out.textContent = label + '\\n' + JSON.stringify(data, null, 2); };

    document.getElementById('login').onclick = async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com', password: 'demo-password' }),
      });
      show('login', await r.json());
    };

    document.getElementById('checkout').onclick = async () => {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com', amount: 99.99, cardPan: '4111111111111111' }),
      });
      show('checkout', await r.json());
    };
  </script>
</body>
</html>`;

app.get('/', (_req, res) => {
  res.type('html').send(HTML);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE });
});

app.post('/api/auth/login', async (_req, res) => {
  try {
    const resp = await fetch(`${STOREFRONT_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: outboundHeaders(),
      body: JSON.stringify({ email: 'alice@example.com', password: 'demo-password' }),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'storefront-api unavailable', detail: String(err) });
  }
});

app.post('/api/checkout', async (req, res) => {
  try {
    const resp = await fetch(`${STOREFRONT_API_URL}/api/checkout`, {
      method: 'POST',
      headers: outboundHeaders(),
      body: JSON.stringify(req.body || {}),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'storefront-api unavailable', detail: String(err) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Acme web-storefront on :${PORT}`);
});
