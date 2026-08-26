# Connect your app

Add an API Glimpse **connector** so real traffic shows up as endpoints and schemas in the dashboard. Set your project API key and API Glimpse URL, then open the project after a few requests.

```
Your app
  → Connector
  → API Glimpse (collect.apiglimpse.com)
  → Dashboard (endpoints, schemas, tags)
```

All connectors speak the same [wire protocol](./WIRE_PROTOCOL.md). There is one hosted collector — not a separate agent per language.

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
| [Node gateway sidecar](#node-gateway-sidecar) | Available (sidecar) | Run `@apiglimpse/gateway-proxy` in front of your app |
| Kong / Nginx / Envoy | Coming soon | — |

> **Note:** npm / PyPI / Go module versions must be [published by maintainers](./CONNECTOR_PUBLISH.md) before customers can install from public registries. Until then, use the demos under `demo/` with local `file:` / editable / `replace` paths.

## Shared prerequisites

1. An API Glimpse account and a **project** (or service) in the [dashboard](https://app.apiglimpse.com).
2. Create an API key (`ask_…`). The key is shown once — copy it then.
3. Collector URL: `https://collect.apiglimpse.com`.
4. Set `API_SENSOR_KEY` (and usually `API_SENSOR_AGENT_URL`) in your app.

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_YOUR_PROJECT_KEY_HERE
API_SENSOR_SAMPLE_RATE=1
```

---

## Express

Package: `@apiglimpse/middleware`.

```
Your Express app
  → @apiglimpse/middleware
  → API Glimpse
  → Dashboard
```

### 1. Install

```bash
npm install @apiglimpse/middleware
```

### 2. Wire the middleware

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

Reference: [`demo/express-app/server.js`](../demo/express-app/server.js).

### Options reference

| Option | Default | Meaning |
| --- | --- | --- |
| `agentUrl` | `https://collect.apiglimpse.com` | Collector base URL |
| `apiKey` | `''` | API key (`ask_…`) |
| `sampleRate` | `1` | Fraction of requests to capture (0–1) |
| `flushIntervalMs` | `1000` | How often the buffer flushes |
| `maxBatchSize` | `50` | Samples per flush |
| `maxBufferSize` | `500` | Cap; excess samples dropped |
| `requestTimeoutMs` | `2000` | HTTP timeout when sending samples |
| `circuitFailureThreshold` | `3` | Failures before pausing sends |
| `circuitOpenMs` | `15000` | Backoff when the collector is unreachable |

---

## Fastify

Package: `@apiglimpse/fastify`.

### 1. Install

```bash
npm install @apiglimpse/fastify
```

### 2. Register the plugin

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

// ... routes
await app.listen({ port: 3000, host: '0.0.0.0' });
```

Reference: [`demo/fastify-app/server.js`](../demo/fastify-app/server.js). Package README: [`packages/fastify/README.md`](../packages/fastify/README.md).

---

## FastAPI

Package: `apiglimpse` (PyPI).

### 1. Install

```bash
pip install apiglimpse
```

Until the package is on PyPI, from this repo:

```bash
pip install -e ./connectors/python
```

### 2. Add middleware

```python
from fastapi import FastAPI
from apiglimpse import ApiGlimpseMiddleware

app = FastAPI()
app.add_middleware(
    ApiGlimpseMiddleware,
    agent_url="https://collect.apiglimpse.com",
    api_key="ask_…",  # or rely on API_SENSOR_KEY
)
```

Env vars `API_SENSOR_AGENT_URL` / `API_SENSOR_KEY` / `API_SENSOR_SAMPLE_RATE` are read as defaults when you omit constructor args (see package README).

Reference: [`demo/fastapi-app`](../demo/fastapi-app). Package README: [`connectors/python/README.md`](../connectors/python/README.md).

---

## Go (chi)

Module: `github.com/jantznick/api-security/connectors/go`.

### 1. Install

```bash
go get github.com/jantznick/api-security/connectors/go/apiglimpse@latest
```

(Use an explicit version like `@v0.1.0` after maintainers [tag a release](./CONNECTOR_PUBLISH.md#c-go-module--chi--nethttp).)

### 2. Use middleware

```go
import (
  "net/http"
  "os"

  "github.com/go-chi/chi/v5"
  "github.com/jantznick/api-security/connectors/go/apiglimpse"
)

func main() {
  r := chi.NewRouter()
  r.Use(apiglimpse.Middleware(apiglimpse.Config{
    AgentURL: os.Getenv("API_SENSOR_AGENT_URL"),
    APIKey:   os.Getenv("API_SENSOR_KEY"),
  }))
  // ... routes
  http.ListenAndServe(":4000", r)
}
```

Or `apiglimpse.Middleware(apiglimpse.ConfigFromEnv())`.

Reference: [`demo/go-chi-app`](../demo/go-chi-app). Package README: [`connectors/go/README.md`](../connectors/go/README.md).

---

## Verify (any connector)

1. Hit a few of **your** routes (browser or `curl`).
2. Open the dashboard → your project → endpoints should show method + path within a few seconds.
3. Optional: `curl -s https://collect.apiglimpse.com/health`.

### What gets captured

- Method, path, status, latency, content-types, auth mode hints
- Truncated / redacted body field names and types (not long-lived storage)
- Sensitive headers (`authorization`, cookies) are removed before data leaves your app

### Troubleshooting

If API Glimpse is unreachable, the connector drops samples and your app continues to serve traffic normally.

### Production

- Point `API_SENSOR_AGENT_URL` at `https://collect.apiglimpse.com`.
- Every batch requires a valid API key — do not ship apps without `API_SENSOR_KEY`.

---

## Node gateway sidecar

Discover traffic **without** installing app middleware. Run the `@apiglimpse/gateway-proxy` reverse-proxy sidecar in front of your service; it forwards HTTP and samples the same envelope v1 as Express/Fastify.

```bash
cd packages/gateway-proxy && npm install

API_SENSOR_UPSTREAM=http://app:3000 \
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com \
API_SENSOR_KEY=ask_YOUR_PROJECT_KEY \
npm start
```

Point clients at the proxy (default port `9080`). Same collector env vars as app connectors, plus required `API_SENSOR_UPSTREAM`.

Kong / Nginx / Envoy native filters are **follow-ups** (see [DECISIONS.md](./DECISIONS.md)) — not available yet.

Package README: [`packages/gateway-proxy/README.md`](../packages/gateway-proxy/README.md).

---

## Maintainer publish

| Registry | Guide |
| --- | --- |
| **All connectors** (npm + PyPI + Go tags) | **[CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md)** |
| npm deep dive (account, org, Express first publish) | [NPM_PUBLISH.md](./NPM_PUBLISH.md) |

Short npm path after org exists:

```bash
cd packages/shared && npm publish --access public
cd ../middleware && npm run publish:npm
cd ../fastify && npm run publish:npm
```

## Not supported yet

- Runtime request blocking (planned later; not enabled today)
