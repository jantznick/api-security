# @apiglimpse/gateway-proxy

Thin **Node reverse-proxy sidecar** that forwards HTTP to your app and samples traffic for API Glimpse — no app middleware required.

Uses the same envelope v1 (`createSample` / `createEnvelope` from `@apiglimpse/shared`) and fail-open circuit breaker as `@apiglimpse/middleware`.

```
Clients
  → gateway-proxy (:9080)
       ├─ forward → your app (API_SENSOR_UPSTREAM)
       └─ sample  → API Glimpse (/v1/samples)
```

Kong / Nginx / Envoy filters are **follow-ups** (see `docs/DECISIONS.md`). This package is the first shippable gateway connector.

## Run locally

```bash
cd packages/gateway-proxy
npm install

API_SENSOR_UPSTREAM=http://127.0.0.1:3000 \
API_SENSOR_AGENT_URL=http://localhost:8080 \
API_SENSOR_KEY=ask_YOUR_PROJECT_KEY \
npm start
```

Or with Docker-style hostnames:

```bash
API_SENSOR_UPSTREAM=http://app:3000 \
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com \
API_SENSOR_KEY=ask_... \
API_SENSOR_PROXY_PORT=9080 \
npm start
```

Point clients at the proxy (`http://localhost:9080`), not the app. Traffic appears in the dashboard like any other connector.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `API_SENSOR_UPSTREAM` | **yes** | — | Upstream app base URL (`http://app:3000`) |
| `API_SENSOR_AGENT_URL` | no | `http://localhost:8080` | Collector base URL |
| `API_SENSOR_KEY` | yes (prod) | `''` | Project API key (`ask_…`) |
| `API_SENSOR_SAMPLE_RATE` | no | `1` | 0–1 sample rate |
| `API_SENSOR_PROXY_PORT` | no | `9080` | Listen port |
| `API_SENSOR_PROXY_HOST` | no | `0.0.0.0` | Listen host |
| `API_SENSOR_MAX_BODY_BYTES` | no | `65536` | Max JSON body size for shape sampling |

## Programmatic use

```js
import { createGatewayProxy } from '@apiglimpse/gateway-proxy';

const proxy = createGatewayProxy({
  upstream: process.env.API_SENSOR_UPSTREAM,
  agentUrl: process.env.API_SENSOR_AGENT_URL,
  apiKey: process.env.API_SENSOR_KEY,
});

await proxy.listen();
```

## Body capture limits

- Method, path, status, latency, and redacted headers are always sampled (when sample rate allows).
- JSON request/response bodies are shaped only when `Content-Type` looks like JSON (or the body starts with `{`/`[`) **and** size ≤ `API_SENSOR_MAX_BODY_BYTES` (64 KiB default).
- Oversized / non-JSON / binary bodies skip `bodyShape` but still contribute inventory metadata.
- Sampling never blocks or fails the proxied request (fail-open + circuit breaker).

## Wire protocol

Same as app connectors: `POST {API_SENSOR_AGENT_URL}/v1/samples` with envelope v1. See [docs/WIRE_PROTOCOL.md](../../docs/WIRE_PROTOCOL.md).

## Install (monorepo)

```bash
cd packages/gateway-proxy && npm install
```

`@apiglimpse/shared` is linked via `file:../shared` for local development.
