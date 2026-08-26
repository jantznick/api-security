# Railway — Acme sales demo stack

Deploy the five-service **Acme Retail** demo in a **separate Railway project** from product prod (`api-glimpse` Postgres / ingest / core / agent). Demo apps point at the existing hosted collector — do not run a second agent.

**Related:** [demo/acme/README.md](../demo/acme/README.md) · [ACME_DEMO_SMOKE.md](./ACME_DEMO_SMOKE.md) · [TOPOLOGY_BASELINE.md](./TOPOLOGY_BASELINE.md) · product [RAILWAY.md](./RAILWAY.md)

---

## Architecture on Railway

```text
                    ┌─────────────────────────────────────┐
                    │  Product prod (existing project)     │
                    │  collect.apiglimpse.com · api · DB    │
                    └──────────────────▲──────────────────┘
                                       │ API_SENSOR_* + ask_ keys
┌──────────────────────────────────────┴──────────────────────────────────────┐
│  Railway project: api-glimpse-acme-demo (NEW)                                │
│                                                                              │
│  PUBLIC                          PRIVATE (railway.internal)                  │
│  web-storefront ──► storefront-api ──► commerce-api ──► fulfillment ──► ledger│
│  :4010              :4011              :4012            :4013           :4014  │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Service | Railway service name | Public domain? | Healthcheck |
| --- | --- | --- | --- |
| `ledger-api` | `ledger-api` | **No** | `GET /health` |
| `fulfillment-api` | `fulfillment-api` | **No** | `GET /health` |
| `commerce-api` | `commerce-api` | **No** | `GET /health` |
| `storefront-api` | `storefront-api` | **Yes** | `GET /health` |
| `web-storefront` | `web-storefront` | **Yes** (optional) | `GET /health` |

**Deploy order (bottom-up):** ledger → fulfillment → commerce → storefront → web.

---

## Prerequisites

- [ ] PR with SF9 + `demo/acme` merged to `main`
- [ ] Product prod live: `https://collect.apiglimpse.com`, `https://api.apiglimpse.com`, dashboard on Render
- [ ] Backend migration applied (`Project.topologyBaseline`, `ProjectTopologyEvent`)
- [ ] Dashboard redeployed with `/projects/:id/topology`
- [ ] Railway account; Nick approves spend for 5 always-on services (or start/stop before calls)

---

## Step 1 — Dashboard project (before Railway)

1. Log in to **app.apiglimpse.com**
2. Create project **Acme Demo**
3. Create **five Services** with names **exactly** (match baseline node ids):

   | Service name | Notes |
   | --- | --- |
   | `web-storefront` | |
   | `storefront-api` | |
   | `commerce-api` | |
   | `fulfillment-api` | |
   | `ledger-api` | |

4. Save each `ask_…` API key — you need one key per Railway service
5. **Topology** → upload `demo/acme/baseline-topology.json` (or paste JSON)
6. Note **project UUID** from the URL: `/projects/<projectId>/topology`

---

## Step 2 — Create Railway project

1. New Project → **Empty project** → name `api-glimpse-acme-demo`
2. Connect GitHub repo `jantznick/api-security` (same repo as product)
3. Enable **Private Networking** for the project (Settings)

Do **not** add Postgres or duplicate product services.

---

## Step 3 — Service template (repeat × 5)

For each service:

| Setting | Value |
| --- | --- |
| **Build context** | Repository root (`.`) |
| **Dockerfile path** | See table below |
| **Root directory** | `/` (repo root) |
| **Watch paths** | `demo/acme/<service>/**`, `packages/**`, `connectors/**` as needed |

| Service | Dockerfile path |
| --- | --- |
| ledger-api | `demo/acme/ledger-api/Dockerfile` |
| fulfillment-api | `demo/acme/fulfillment-api/Dockerfile` |
| commerce-api | `demo/acme/commerce-api/Dockerfile` |
| storefront-api | `demo/acme/storefront-api/Dockerfile` |
| web-storefront | `demo/acme/web-storefront/Dockerfile` |

Rename each Railway service to match the **service name** column (stable `*.railway.internal` hostnames).

---

## Step 4 — Environment variables

Use **fixed `PORT` values** so internal URLs stay stable. Railway may inject `PORT`; set these explicitly on each service.

Copy from [demo/acme/railway.env.example](../demo/acme/railway.env.example).

### ledger-api (internal only)

| Variable | Value |
| --- | --- |
| `PORT` | `4014` |
| `NODE_ENV` | `production` |
| `API_SENSOR_AGENT_URL` | `https://collect.apiglimpse.com` |
| `API_SENSOR_KEY` | `<ask_ key for ledger-api service>` |
| `API_SENSOR_SERVICE_NAME` | `ledger-api` |

**Networking:** do **not** generate a public domain.

### fulfillment-api

| Variable | Value |
| --- | --- |
| `PORT` | `4013` |
| `API_SENSOR_AGENT_URL` | `https://collect.apiglimpse.com` |
| `API_SENSOR_KEY` | `<ask_ fulfillment-api>` |
| `API_SENSOR_SERVICE_NAME` | `fulfillment-api` |
| `LEDGER_URL` | `http://ledger-api.railway.internal:4014` |

No public domain.

### commerce-api

| Variable | Value |
| --- | --- |
| `PORT` | `4012` |
| `API_SENSOR_AGENT_URL` | `https://collect.apiglimpse.com` |
| `API_SENSOR_KEY` | `<ask_ commerce-api>` |
| `API_SENSOR_SERVICE_NAME` | `commerce-api` |
| `FULFILLMENT_URL` | `http://fulfillment-api.railway.internal:4013` |

No public domain.

### storefront-api (public)

| Variable | Value |
| --- | --- |
| `PORT` | `4011` |
| `API_SENSOR_AGENT_URL` | `https://collect.apiglimpse.com` |
| `API_SENSOR_KEY` | `<ask_ storefront-api>` |
| `API_SENSOR_SERVICE_NAME` | `storefront-api` |
| `COMMERCE_URL` | `http://commerce-api.railway.internal:4012` |

Generate **public HTTPS domain** (e.g. `storefront-api-production-xxxx.up.railway.app`). Optional custom domain later.

### web-storefront (public, optional)

| Variable | Value |
| --- | --- |
| `PORT` | `4010` |
| `API_SENSOR_AGENT_URL` | `https://collect.apiglimpse.com` |
| `API_SENSOR_KEY` | `<ask_ web-storefront>` |
| `API_SENSOR_SERVICE_NAME` | `web-storefront` |
| `STOREFRONT_API_URL` | `http://storefront-api.railway.internal:4011` |

Generate public domain for browser demo UI.

> **Traffic script** uses `STOREFRONT_URL` = public **storefront-api** URL (not web), so storefront-api public domain is required; web-storefront is optional polish.

---

## Step 5 — Deploy order & smoke

Deploy **ledger-api** first; wait for healthy, then fulfillment → commerce → storefront → web.

From your laptop (after public URL exists):

```bash
export STOREFRONT_URL=https://<storefront-api>.up.railway.app
node demo/acme/scripts/smoke-test.mjs --once
```

Full checklist: [ACME_DEMO_SMOKE.md](./ACME_DEMO_SMOKE.md)

---

## Step 6 — Integrate with dashboard (Render)

Add to Render **dashboard** static site environment (optional quick links on Topology page):

```bash
VITE_ACME_DEMO_STOREFRONT_URL=https://<storefront-api>.up.railway.app
VITE_ACME_DEMO_WEB_URL=https://<web-storefront>.up.railway.app
VITE_ACME_DEMO_PROJECT_ID=<uuid-from-step-1>
```

Redeploy dashboard after setting variables.

---

## Step 7 — Optional custom domains

| Host (example) | Service |
| --- | --- |
| `demo-storefront.apiglimpse.com` | storefront-api |
| `demo.aciglimpse.com` | web-storefront |

DNS CNAME → Railway public hostname. Not required for internal smoke tests.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Checkout 502/503 | Upstream `*_URL` uses correct `*.railway.internal` **service name** and **PORT** |
| Inventory empty | `API_SENSOR_KEY` matches dashboard service; `API_SENSOR_AGENT_URL` is collect prod URL |
| Topology compare all missing | Service **names** in dashboard match baseline node ids; run `--profile full` traffic |
| Internal service reachable publicly | Remove public domain from commerce/fulfillment/ledger |
| `401` from agent | Key revoked or wrong service key on wrong container |

---

## Cost & lifecycle

- Five containers × always-on ≈ lowest tier each; Nick gate before leaving running 24/7
- For sales calls only: start project services ~30 min before, run smoke, stop after (Railway sleep if available)
- Demo uses **synthetic data only** — no production customer keys

---

## CLI cheatsheet

```bash
railway login
railway link          # select api-glimpse-acme-demo
railway status
railway logs -s ledger-api
railway variables --service storefront-api
```

Prefer GitHub → Railway auto-deploy on `main` with watch paths scoped to `demo/acme/`.

---
