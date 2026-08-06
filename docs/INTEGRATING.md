# Connect your app

Add an API Glimpse **connector** so real traffic shows up as endpoints and schemas in the dashboard. Set your project API key and API Glimpse URL, then open the project after a few requests.

```
Your app
  → Connector
  → API Glimpse
  → Dashboard (endpoints, schemas, tags)
```

## Connectors

| Connector | Status |
| --- | --- |
| [Express](#express) | Available now |
| Fastify | Coming soon |
| NestJS | Coming soon |
| Next.js (Route Handlers / API routes) | Coming soon |
| Hono | Coming soon |
| FastAPI | Coming soon |
| Go (chi) | Coming soon |
| Proxy / gateway | Coming soon |

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
2. Create a project API key (`ask_…`). The key is shown once when you create it — copy it then.
3. API Glimpse URL: `https://collect.apiglimpse.com`.
4. Put that key in your app as `API_SENSOR_KEY`. API Glimpse checks it on every batch.

### 1. Install the connector

```bash
npm install @apiglimpse/middleware
```

### 2. Environment variables

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_YOUR_PROJECT_KEY_HERE
API_SENSOR_SAMPLE_RATE=1
```

### 3. Wire the middleware

Mount it **early** — after body parsers you care about (so JSON bodies are available), and **before** (or around) the routes you want discovered.

#### ESM (`"type": "module"` or `.mjs`)

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

Reference implementation (repo): [`demo/express-app/server.js`](../demo/express-app/server.js).

### 4. Verify

1. Hit a few of **your** routes (browser or `curl`)
2. Open the dashboard → your project → endpoints should show method + path within a few seconds
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
- Truncated / redacted body field names and types (not long-lived storage)
- Sensitive headers (`authorization`, cookies) are removed before data leaves your app

API Glimpse stores inferred schemas and tags — not long-lived raw request bodies.

### Placement tips

- Prefer mounting once at the app root so all routes are visible.
- If you only want a subset, mount the middleware on a nested `Router` instead of `app`.
- Health checks you don’t care about can sit **above** the middleware so they aren’t listed:

```js
app.get('/health', (_req, res) => res.send('ok'));
app.use(apiSensor({ /* ... */ }));
```

### Production apps

- Point `API_SENSOR_AGENT_URL` at `https://collect.apiglimpse.com`.
- Every batch requires a valid project API key — do not ship apps without `API_SENSOR_KEY`.

### Troubleshooting

If API Glimpse is unreachable, the connector drops samples and your app continues to serve traffic normally.

## npm publish (maintainers)

Nick runs these after Railway/Render are up. Packages are prepared in-repo (`files`, `publishConfig`, READMEs); publishing is click-ops / CLI on your machine.

For local monorepo installs while developing packages, use `file:` deps (already wired in `package.json`). Ops / local stack notes: [TESTING.md](TESTING.md), [RAILWAY.md](RAILWAY.md), [RENDER.md](RENDER.md).

### Prerequisites

- npm account with permission to publish `@apiglimpse/*`
- Logged in: `npm login`

### 1. Publish `@apiglimpse/shared`

```bash
cd packages/shared
npm publish --access public
```

### 2. Publish `@apiglimpse/middleware`

The monorepo uses `"@apiglimpse/shared": "file:../shared"` for local installs. Before publish, point at the registry version:

```bash
cd packages/middleware
# Edit package.json dependencies to:
#   "@apiglimpse/shared": "^0.1.0"
npm install
npm publish --access public
```

Restore `file:../shared` afterward if you keep developing in the monorepo without pulling shared from npm.

### 3. Verify

```bash
npm view @apiglimpse/shared version
npm view @apiglimpse/middleware version
# In a scratch dir:
npm install @apiglimpse/middleware
```

Bump `version` in both `package.json` files for subsequent releases (publish **shared** before **middleware** when both change).

## Not supported yet

- Runtime request blocking (planned later; not enabled today)
