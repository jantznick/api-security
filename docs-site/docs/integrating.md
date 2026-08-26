# Connect your app

Add an API Glimpse **connector** so real traffic shows up as endpoints and schemas in the dashboard. Set your project API key and API Glimpse URL, then open the project after a few requests.

```
Your app
  → Connector
  → API Glimpse
  → Dashboard (endpoints, schemas, tags)
```

## Connectors

| Connector | Status | Install |
| --- | --- | --- |
| [Express](#express) | Available | `npm install @apiglimpse/middleware` |
| [Fastify](#fastify) | Available | `npm install @apiglimpse/fastify` |
| [FastAPI](#fastapi) | Available | `pip install apiglimpse` |
| [Go (chi)](#go-chi) | Available | `go get github.com/jantznick/api-security/connectors/go/apiglimpse` |
| NestJS | Coming soon | — |
| Next.js (Route Handlers / API routes) | Coming soon | — |
| Hono | Coming soon | — |
| Proxy / gateway | Coming soon | — |

All connectors send the same samples to `https://collect.apiglimpse.com` (one hosted collector).

## Express

Add the Express connector (`@apiglimpse/middleware`) to your app.

```
Your Express app
  → @apiglimpse/middleware
  → API Glimpse
  → Dashboard (endpoints, schemas, tags)
```

### Prerequisites

1. An API Glimpse account and a **project** in the [dashboard](https://app.apiglimpse.com).
2. A project API key (`ask_…`) — shown once when you create it.
3. The API Glimpse URL: `https://collect.apiglimpse.com`.
4. `API_SENSOR_KEY` and `API_SENSOR_AGENT_URL` set in your app environment.

### Install

```bash
npm install @apiglimpse/middleware
```

### Environment variables

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_YOUR_PROJECT_KEY_HERE
API_SENSOR_SAMPLE_RATE=1
```

### Wire the middleware

Mount it **early** — after body parsers you care about (so JSON bodies are available), and **before** (or around) the routes you want discovered.

#### ESM

```js
import express from 'express';
import { apiSensor } from '@apiglimpse/middleware';

const app = express();

app.use(express.json());

app.use(
  apiSensor({
    agentUrl: process.env.API_SENSOR_AGENT_URL || 'https://collect.apiglimpse.com',
    apiKey: process.env.API_SENSOR_KEY || '',
    sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
  }),
);

// ... existing routes
```

#### CommonJS

The middleware package is ESM. Prefer converting the entry file, or use a dynamic import:

```js
const express = require('express');

async function main() {
  const { apiSensor } = await import('@apiglimpse/middleware');
  const app = express();

  app.use(express.json());
  app.use(
    apiSensor({
      agentUrl: process.env.API_SENSOR_AGENT_URL || 'https://collect.apiglimpse.com',
      apiKey: process.env.API_SENSOR_KEY || '',
      sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
    }),
  );

  // ... existing routes, app.listen, etc.
}

main();
```

### Verify

1. Hit a few of **your** routes
2. Dashboard → project → endpoints should show method + path within a few seconds
3. Optional: `curl -s $API_SENSOR_AGENT_URL/health` to confirm API Glimpse is reachable

### Options reference

| Option | Default | Meaning |
| --- | --- | --- |
| `agentUrl` | `https://collect.apiglimpse.com` | API Glimpse base URL |
| `apiKey` | `''` | Project API key (`ask_…`) |
| `sampleRate` | `1` | Fraction of requests to capture (0–1) |
| `flushIntervalMs` | `1000` | How often the buffer flushes |
| `maxBatchSize` | `50` | Samples per flush |
| `maxBufferSize` | `500` | Cap; excess samples dropped |
| `requestTimeoutMs` | `2000` | HTTP timeout when sending samples |
| `circuitFailureThreshold` | `3` | Failures before pausing sends |
| `circuitOpenMs` | `15000` | How long to wait before retrying when API Glimpse is unreachable |

### What gets captured

- Method, path, status, latency, content-types, auth mode hints
- Truncated / redacted body field names and types
- Sensitive headers (`authorization`, cookies) are removed before data leaves your app

API Glimpse stores inferred schemas and tags — not long-lived raw request bodies.

### Placement tips

- Prefer mounting once at the app root so all routes are visible.
- For a subset, mount on a nested `Router` instead of `app`.
- Health checks you don’t care about can sit **above** the middleware:

```js
app.get('/health', (_req, res) => res.send('ok'));
app.use(apiSensor({ /* ... */ }));
```

### Production apps

- Point `API_SENSOR_AGENT_URL` at `https://collect.apiglimpse.com`.
- Set `API_SENSOR_KEY` before you ship. Every batch needs a valid project API key.

### Troubleshooting

**No endpoints after traffic**

- Confirm `API_SENSOR_KEY` matches a key for the project you are viewing.
- Confirm `API_SENSOR_AGENT_URL` points at `https://collect.apiglimpse.com` (or check `/health`).
- Mount the middleware after `express.json()` (or other body parsers) and where the routes you care about are covered.

**API Glimpse unreachable**

If API Glimpse is unreachable, the connector drops samples and your app continues to serve traffic normally. Sampling resumes when the service is available again.

---

## Fastify

```bash
npm install @apiglimpse/fastify
```

```js
import Fastify from 'fastify';
import { apiSensor } from '@apiglimpse/fastify';

const app = Fastify();

await app.register(
  apiSensor({
    agentUrl: process.env.API_SENSOR_AGENT_URL || 'https://collect.apiglimpse.com',
    apiKey: process.env.API_SENSOR_KEY,
    sampleRate: Number(process.env.API_SENSOR_SAMPLE_RATE || 1),
  }),
);
```

Same env vars as Express (`API_SENSOR_AGENT_URL`, `API_SENSOR_KEY`, `API_SENSOR_SAMPLE_RATE`).

---

## FastAPI

```bash
pip install apiglimpse
```

```python
from fastapi import FastAPI
from apiglimpse import ApiGlimpseMiddleware

app = FastAPI()
app.add_middleware(
    ApiGlimpseMiddleware,
    agent_url="https://collect.apiglimpse.com",
    api_key="ask_…",
)
```

---

## Go (chi)

```bash
go get github.com/jantznick/api-security/connectors/go/apiglimpse@latest
```

```go
r.Use(apiglimpse.Middleware(apiglimpse.Config{
  AgentURL: os.Getenv("API_SENSOR_AGENT_URL"),
  APIKey:   os.Getenv("API_SENSOR_KEY"),
}))
```

---

## Not supported yet

- Runtime request blocking
