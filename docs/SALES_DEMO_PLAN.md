# Sales demo environment — multi-service “Acme” stack

**Audience:** Nick + sales — review → implement as a small compose/Railway pack.  
**Product story this unlocks:** *See → Understand* live on a call: inventory, sensitive-field classification, auth gaps, and caller→endpoint topology across languages.  
**Related:** [SALES_FEATURES_PLAN.md](./SALES_FEATURES_PLAN.md) (SF1–SF4 already demoable), [RAILWAY.md](./RAILWAY.md), [INTEGRATING.md](./INTEGRATING.md).

---

## Correct the mental model first

| Phrase in the ask | What we actually ship |
| --- | --- |
| “Orchestrated with their language agent” | **One** multi-tenant hosted agent (`collect.apiglimpse.com`). Each demo app uses a **language connector** (Express / FastAPI / Go / …) that posts samples to that same agent with its own `ask_…` key. |
| “Agents talking to each other” | **Services** call each other over HTTP. Topology edges come from `API_SENSOR_SERVICE_NAME` / `X-Service-Name` on those hops (SF3) — not agent-to-agent chatter. |
| “Docker Compose group on Railway” | Use Compose for **local** one-command bring-up. On Railway, map each container to a **service** in one project; “internal only” = no public domain + `*.railway.internal` URLs (same pattern as ingest today). |

Isolation for the demo project is **org → project → service + API keys**, same as a real customer. Do not spin a collector per language.

```text
                    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
                    │ web-store   │  │ mobile-app  │  │ partner-api │
                    │ (browser)   │  │ (script)    │  │ (script)    │
                    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                           │                │                │
                           └────────────────┼────────────────┘
                                            ▼
                                   ┌────────────────┐
                                   │ storefront-api │  PUBLIC (Express)
                                   │  "first API"   │
                                   └───────┬────────┘
                                           │ private
                                           ▼
                                   ┌────────────────┐
                                   │ commerce-api   │  PRIVATE (FastAPI)
                                   └───────┬────────┘
                                           │ private
                                           ▼
                                   ┌────────────────┐
                                   │ fulfillment-api│  PRIVATE (Go chi)
                                   └───────┬────────┘
                                           │ private (deepest hop)
                                           ▼
                                   ┌────────────────┐
                                   │ ledger-api     │  INTERNAL ONLY (Nest/Spring)
                                   └────────────────┘

  Each hop: connector + API_SENSOR_SERVICE_NAME + X-Service-Name on outbound calls
  All five → shared agent → project-level topology + baseline compare (SF9)
```

---

## Recommended “Acme Retail” topology (minimum five services)

**Five instrumented services**, not five languages for their own sake. The story is a **chain** (frontend → API → API → internal-only API) **plus** other clients hitting the first public API.

| # | Service | Language / connector | Exposure | Role on the call |
| --- | --- | --- | --- | --- |
| 1 | **web-storefront** | Next.js (`@apiglimpse/next`) | **Public** | Browser UI; server-side calls `storefront-api` — proves “frontend → API” |
| 2 | **storefront-api** | Express | **Public** | **First API** — entry for web, mobile script, partner script |
| 3 | **commerce-api** | FastAPI | **Private** | Second hop; PII (users, profiles) |
| 4 | **fulfillment-api** | Go chi | **Private** | Third hop; orders / shipping |
| 5 | **ledger-api** | NestJS or Spring | **Internal only** | Deepest hop; payment ledger / secrets — no public domain, only reachable from fulfillment |

**Other clients** (not separate deployables — the traffic script simulates them into `storefront-api`):

| Client | How simulated | `X-Service-Name` / caller label |
| --- | --- | --- |
| Mobile app | `traffic.mjs --profile mobile` | `mobile-app` |
| Partner integration | `traffic.mjs --profile partner` | `partner-billing` |
| Nightly batch (optional) | `--profile batch` | `nightly-reconciliation` |

That gives a project-level graph with **multiple caller nodes into one public API**, then a **linear chain** into the internal tier — exactly the architecture buyers draw on whiteboards.

Optional act-two (not counted toward the five): **Nginx/Kong** in front of `storefront-api` for SF5 “discover at the edge” — platform-team calls only.

### Service naming (required for topology)

Every service sets:

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com   # or local :8080
API_SENSOR_KEY=ask_...                                 # one project; one key per Service row
API_SENSOR_SERVICE_NAME=storefront-api                   # unique, stable
```

On outbound HTTP between services, also send:

```http
X-Service-Name: storefront-api
```

Dashboard proof (today, per-service): Inventory → **Callers (topology)** on `commerce-api` shows `storefront-api → …`, on `ledger-api` shows `fulfillment-api → …`.

Project-level graph + baseline compare (proposed SF9): see [Import baseline topology & compare](#import-baseline-topology--compare-sf9).

### Public vs private on Railway

| Service | Public domain? | How callers reach it |
| --- | --- | --- |
| `web-storefront`, `storefront-api` | Yes | Browser / traffic script |
| `commerce-api`, `fulfillment-api` | **No** | `*.railway.internal` from upstream only |
| `ledger-api` | **No** (strictest) | Only `fulfillment-api` may call it |
| Shared agent / core / ingest | Existing prod | Demo apps point at prod collect URL |

Local Compose mirrors this: internal network + only `web-storefront` and `storefront-api` published.

---

## Import baseline topology & compare (SF9)

**This is not shipped today** — but it is the right product hook for the demo and worth planning as **SF9** (extends SF3, aligns with “docs vs reality” for *architecture*, not just OpenAPI).

### Why it’s powerful on a call

Buyers already have a diagram — Lucidchart, Terraform comments, Confluence, or an architecture review PDF. The pitch becomes:

> “Upload what you *think* the system looks like. We show what traffic *proves* — missing hops, shadow paths, extra callers.”

That is stronger than live discovery alone because it reframes API Glimpse as a **continuous architecture validator**, not only an inventory tool.

### What we observe today vs what we need

| Today (SF3) | Gap |
| --- | --- |
| `TrafficEdge`: caller → `(serviceId, method, pathTemplate)` | Edges are **per target service**, not a unified project graph |
| Topology UI is per-service caller list | No import, no diff, no cross-service SVG |
| Callers need `API_SENSOR_SERVICE_NAME` / `X-Service-Name` | Good — baseline compare should use the same labels |

**MVP compare** should work at **service-to-service edge** granularity first (whiteboard level). Endpoint-level diff is a follow-up ( overlaps with OpenAPI import compare).

### Baseline format (v1 — ship with demo)

Simple JSON checked into `demo/acme/baseline-topology.json`:

```json
{
  "version": 1,
  "nodes": [
    { "id": "web-storefront", "label": "Web Storefront", "tier": "public" },
    { "id": "storefront-api", "label": "Storefront API", "tier": "public" },
    { "id": "commerce-api", "label": "Commerce API", "tier": "private" },
    { "id": "fulfillment-api", "label": "Fulfillment API", "tier": "private" },
    { "id": "ledger-api", "label": "Ledger API", "tier": "internal" }
  ],
  "edges": [
    { "from": "web-storefront", "to": "storefront-api" },
    { "from": "mobile-app", "to": "storefront-api", "caller": true },
    { "from": "partner-billing", "to": "storefront-api", "caller": true },
    { "from": "storefront-api", "to": "commerce-api" },
    { "from": "commerce-api", "to": "fulfillment-api" },
    { "from": "fulfillment-api", "to": "ledger-api" }
  ]
}
```

`caller: true` nodes are **external callers** (no connector required) — matched against `TrafficEdge.callerLabel` on `storefront-api`.

Optional later: Mermaid import, draw.io XML, or “paste diagram” — don’t block v1 on parsers.

### Product sketch (SF9)

1. **Upload** baseline on Project settings (`POST /api/projects/:id/topology-baseline`).
2. **Derive observed graph** — roll up `TrafficEdge` across all Services in the project; map `callerLabel → serviceId` when caller is another instrumented service.
3. **Diff**:
   - **Missing** — in baseline, never seen in traffic (red) — “documented but dead / wrong”
   - **Matched** — seen with hits (green)
   - **Shadow** — seen, not in baseline (amber) — “undocumented dependency / shadow API”
   - **Stale** — in baseline, zero hits after N days (gray) — optional
4. **UI** — project Topology page: side-by-side or overlay graph; click edge for example `(method, pathTemplate)` hits.

### Demo-deliberate drift (rehearsable)

Bake two intentional mismatches into the traffic script so the compare view *does something* on every call:

| Drift | Baseline says | Traffic does | Story |
| --- | --- | --- | --- |
| Shadow edge | — | `storefront-api` occasionally calls a **legacy-pricing** stub (sixth unlisted service or route) | Undocumented dependency |
| Missing edge | `commerce-api → fulfillment-api` always | `--profile partial` skips fulfillment once | “Diagram says X; traffic never proves it” |
| Extra caller | only mobile + partner | `--profile rogue` sends `X-Service-Name: unknown-vendor` | Shadow client |

### Phasing

| Phase | What ships | Demo value |
| --- | --- | --- |
| **A** (demo-only) | `baseline-topology.json` + static Mermaid in README; manual compare | Unblocks sales narrative before SF9 code |
| **B** (SF9 MVP) | Upload JSON + project diff API + simple graph UI | Live compare on calls |
| **C** | Drift alerts on topology (`topology.edge.missing` / `.shadow`) | Ties SF2 + SF9 for renewal |

**Recommendation:** Start phase A in `demo/acme/` immediately; prioritize SF9-B right after the five-service stack is running — it is the demo’s headline feature.

## Payloads that actually exercise classification

Hello-world `/health` is not enough. Each service needs a small, intentional **data diet**:

| Endpoint | Service | Direction | Fields | Demo beat |
| --- | --- | --- | --- | --- |
| `POST /api/auth/login` | storefront | req + res | email, password → JWT | secrets + auth |
| `POST /api/checkout` | storefront → chain | orchestration | fans out commerce → fulfillment → ledger | **proves 4-hop chain** |
| `POST /api/users` | commerce | req | email, phone, ssn | PII signals |
| `GET /api/users/:id` | commerce | res | email, phone | response classification |
| `POST /api/orders` | fulfillment | req | card-shaped pan, amount | card signal |
| `POST /api/ledger/entries` | ledger | req + res | accountId, token-shaped secret | deepest internal + secrets |
| `POST /internal/debug/export` | ledger | req | bulk PII-shaped export | shadow route + auth gap |

Rules:

1. Use **synthetic** but pattern-matching values (`4111…`, `000-00-0000`, `alice@example.com`) so classifiers fire without real PII.
2. Keep bodies **JSON and small** — connectors skip streams/binary by design.
3. Mix **auth**: storefront routes with bearer; ledger internal route **without** auth → “No auth observed.”
4. **Chain contract:** `POST /api/checkout` on storefront must synchronously call commerce → fulfillment → ledger so one user action lights up all five inventories.

---

## Traffic script (required)

Ship `demo/acme/traffic.mjs` with profiles:

1. **`--profile web`** (default) — hits public `web-storefront` or `storefront-api` only; never calls internals directly.
2. **`--profile mobile`** / **`--profile partner`** — hit `storefront-api` with distinct `X-Service-Name` (other clients into first API).
3. **`--profile full`** — web login + checkout (exercises full chain) + shadow ledger export.
4. **`--profile partial`** — skips fulfillment hop once (topology **missing edge** for SF9 demo).
5. **`--once`** / **`--loop 30s`** — rehearse vs keep-alive.

Fixed scenario (full):

```text
traffic --profile full --once
  # web path
  POST /api/auth/login          (storefront)
  POST /api/checkout            → commerce → fulfillment → ledger
  # other clients into first API
  GET  /api/catalog             (mobile-app caller)
  POST /api/webhooks/billing    (partner-billing caller)
  # deliberate drift
  POST /internal/debug/export   (ledger shadow route)
→ “Project Acme → Topology compare → Missing / Shadow edges”
```

---

## Dashboard project setup (one-time)

1. Org/project: **Acme Demo**.
2. Create **five Services** (one key each) matching baseline node ids.
3. Upload `baseline-topology.json` when SF9 ships; until then, keep baseline in repo + import manually for slides.
4. Bookmark: project topology compare, per-service inventory (signals), posture, evidence export.

Pre-warm: run `--profile full --once` before the call so compare isn’t empty; use `--profile partial` live to show a **missing edge**.

---

## Call narrative (~12–15 minutes)

| Min | Show | Say |
| --- | --- | --- |
| 0–1 | Baseline diagram (imported or slide) | “This is what architecture review says.” |
| 1–2 | Run `traffic --profile full --once` | “Same traffic your stack already generates.” |
| 2–4 | **Topology compare** (SF9) or side-by-side | “Green = proven; red = documented but unseen; amber = shadow.” |
| 4–6 | Per-service inventory (commerce, ledger) | “PII and secrets appear where the chain actually touches data.” |
| 6–8 | Callers into **storefront-api** | “Web, mobile, partner — three clients, one public entrypoint.” |
| 8–10 | Chain depth on ledger | “Four hops to internal-only; blast radius if storefront is abused.” |
| 10–12 | `--profile partial` → missing edge | “Diagram lied — fulfillment hop never happened in this run.” |
| 12–15 | Evidence export | “Dated proof for audit / M&A.” |

Leave protect / tickets for enterprise follow-ups unless the prospect asks (SF6–SF7).

---

## Implementation shape (when building)

### Repo layout (proposal)

```text
demo/acme/
  docker-compose.yml
  baseline-topology.json    # SF9 baseline + demo drift targets
  traffic.mjs
  README.md
  web-storefront/           # Next (or static + fetch)
  storefront-api/           # Express — public first API
  commerce-api/             # FastAPI
  fulfillment-api/          # Go chi
  ledger-api/               # Nest or Spring — internal only
```

Prefer thin wrappers around existing `demo/*` apps. Each downstream service exposes 1–2 routes the upstream calls; don’t duplicate full CRUD everywhere.

### Compose (local)

- Network `acme-internal`.
- Publish `web-storefront` + `storefront-api` only.
- Env: five keys + `COMMERCE_URL`, `FULFILLMENT_URL`, `LEDGER_URL` on internal DNS names.

### Railway

- Five services in one project; public domains on **web + storefront-api** only.
- `ledger-api`: no public URL; ingress rules / env restrict callers to fulfillment hostname.

---

## What you’re missing (updated)

1. **Five-service chain + multi-client entry** — not a flat BFF fan-out; storefront is the hub, ledger is the leaf.
2. **Baseline topology import + compare (SF9)** — the “powerful” moment; plan demo drift even before the UI ships.
3. **Project-level graph aggregation** — today’s topology is per-service; SF9 needs roll-up across Services.
4. **Traffic profiles** — web vs mobile vs partner vs partial (missing hop) vs full chain.
5. **Frontend as first hop** — Next server-side fetch into storefront-api proves “browser → API” without treating curl as the only client.
6. Everything from the prior gap list still applies: stable service names, classification payloads, auth mix, shadow routes, rehearseable script, one shared agent, honest limits on shape-only capture.

---

## Non-goals

- Full mesh / every connector in `demo/`.
- Parsing arbitrary Lucidchart/draw.io on day one (JSON baseline first).
- Service mesh / eBPF / full APM.
- Real payments, real IdP, real PII.

---

## Build order (when Nick greenlights)

| Step | Deliverable | Done when |
| --- | --- | --- |
| D0 | Plan locked (five services + SF9 scope) | This doc approved |
| D1 | `demo/acme` five apps + compose + baseline JSON | Full chain works locally |
| D2 | Traffic profiles + README | AE runs `--profile full` without engineering |
| D3 | Railway five-service deploy | Public web + storefront only |
| D4 | **SF9 MVP** — upload baseline + project compare UI | Live missing/shadow on call |
| D5 | Sales one-pager + optional topology drift alerts | Linked from `docs/ads/` |

D1–D3 can parallelize with D4 once edge aggregation API is specced.

---

## Review checklist

- [ ] Lock five services: Next + Express + FastAPI + Go + Nest (or Spring for ledger)
- [ ] SF9 in same wave as demo vs demo-first with static compare slide
- [ ] Include `web-storefront` as deployed app vs traffic-only “web” simulation
- [ ] Pre-warm vs live `--profile partial` missing-edge reveal
- [ ] Railway always-on vs start-before-call (five services = higher idle cost)
