# Acme Retail — sales demo stack

Five instrumented services in a checkout chain plus a browser-facing web storefront. All services post samples to the shared API Glimpse agent using language connectors.

## Topology

```text
web-storefront (4010, public)
       │
       ▼
storefront-api (4011, public) ◄── mobile-app, partner-billing (traffic script)
       │
       ▼
commerce-api (4012, private)
       │
       ▼
fulfillment-api (4013, private)
       │
       ▼
ledger-api (4014, internal only)
```

Baseline diagram: [baseline-topology.json](./baseline-topology.json) (canonical copy of `packages/shared/fixtures/acme-baseline-v1.json`).

## Quick start (local)

From repo root:

```bash
cd demo/acme
cp .env.example .env   # optional — edit API_SENSOR_KEY_* placeholders
docker compose up --build
```

Published ports:

| Service | URL |
| --- | --- |
| web-storefront | http://localhost:4010 |
| storefront-api | http://localhost:4011 |

Internal services (`commerce-api`, `fulfillment-api`, `ledger-api`) are reachable only on the `acme-internal` Docker network.

### Run without Docker

Each app has its own `.env.example`. Install deps from the service directory, then start in dependency order (ledger → fulfillment → commerce → storefront → web).

```bash
# Example: storefront-api
cd demo/acme/storefront-api
npm install
cp .env.example .env
npm start
```

Set `COMMERCE_URL`, `FULFILLMENT_URL`, `LEDGER_URL`, and `STOREFRONT_API_URL` to `http://localhost:401x` when running on the host.

## Traffic script

Hits **public storefront-api only** (never internal services directly):

```bash
node demo/acme/traffic.mjs --profile full --once
node demo/acme/traffic.mjs --profile partial --once
node demo/acme/traffic.mjs --profile mobile --once
node demo/acme/traffic.mjs --loop 30s
```

| Profile | Behavior |
| --- | --- |
| `web` (default) | Health + login |
| `mobile` | `GET /api/catalog` with `X-Service-Name: mobile-app` |
| `partner` | `POST /api/webhooks/billing` with `X-Service-Name: partner-billing` |
| `full` | Login + checkout (4-hop chain + shadow ledger export) + catalog + partner webhook + legacy pricing stub |
| `partial` | Login + catalog — **skips checkout** (missing chain edge for SF9) |

Env: `STOREFRONT_URL` (default `http://localhost:4011`).

## Dashboard setup (one-time)

1. Create project **Acme Demo** with five Services named exactly:
   - `web-storefront`, `storefront-api`, `commerce-api`, `fulfillment-api`, `ledger-api`
2. Paste each service's `ask_…` key into compose env (`API_SENSOR_KEY_*`) or Railway variables.
3. Set `API_SENSOR_AGENT_URL=https://collect.apiglimpse.com` (or local collector).
4. Upload `baseline-topology.json` when project topology compare (SF9) ships.

## AE runbook (~12 min)

| Step | Action | Dashboard |
| --- | --- | --- |
| 1 | Show baseline diagram / JSON | "Architecture review says this." |
| 2 | `node traffic.mjs --profile full --once` | Pre-warm inventories |
| 3 | Topology compare (SF9) or per-service **Callers** | Green matched edges; mobile + partner into storefront |
| 4 | Open **commerce-api** inventory | PII on `POST /api/users` (email, ssn-shaped) |
| 5 | Open **ledger-api** inventory | Deepest hop; token-shaped secrets |
| 6 | `node traffic.mjs --profile partial --once` | Missing checkout chain — fulfillment edge not proven |
| 7 | Mention shadow drift | `GET /api/pricing/legacy` + ledger `/internal/debug/export` (no auth) |

### Deliberate drift (rehearsable)

| Signal | How |
| --- | --- |
| Missing edge | `--profile partial` skips checkout |
| Shadow route | `--profile full` triggers ledger `/internal/debug/export` via checkout |
| Shadow dependency | `--profile full` hits `GET /api/pricing/legacy` (not in baseline) |

## Service endpoints

### storefront-api (public)

- `GET /health`
- `POST /api/auth/login` — email, password → JWT-shaped token
- `POST /api/checkout` — fans out to commerce → fulfillment → ledger
- `GET /api/catalog` — mobile profile
- `POST /api/webhooks/billing` — partner profile
- `GET /api/pricing/legacy` — shadow edge (not in baseline)

### commerce-api (private)

- `POST /api/users`, `GET /api/users/{id}`, `POST /api/checkout`

### fulfillment-api (private)

- `POST /api/orders`, `POST /api/checkout`

### ledger-api (internal)

- `POST /api/ledger/entries`
- `POST /internal/debug/export` — no auth, PII-shaped bulk export

### web-storefront (public)

- `GET /` — minimal HTML UI
- `POST /api/checkout` — proxy to storefront-api with `X-Service-Name: web-storefront`

## Railway

Deploy each folder as a separate service in one project. Public domains on **web-storefront** and **storefront-api** only. Internal URLs use `*.railway.internal` (e.g. `http://commerce-api.railway.internal:4012`).

## Synthetic data

All payloads use pattern-matching demo values (`alice@example.com`, `000-00-0000`, `4111111111111111`, `sk_live_demo_*`). No real PII or payments.
