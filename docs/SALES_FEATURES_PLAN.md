# Sales features plan — compelling use cases → multi-agent build

**Audience:** Nick reviews → launches parallel Cloud Agents.  
**Prior plans:** Soft-launch infra, Stripe/billing (`PARALLEL_PLAN.md`), SaaS hierarchy (`SAAS_PLAN.md`), marketing (`MARKETING_PLAN.md`) — **do not rebuild**.  
**Product narrative this unlocks:** *See → Understand → Act* (inventory today → risk/topology/evidence next → protect later).

Plan mode is unavailable in the current Cloud Agent session; this doc is the reviewable plan of record for the next product wave.

---

## Sales narrative (locked for copy + roadmap)

**One sentence:**  
API Glimpse turns live traffic into a living inventory, risk map, and OpenAPI — so you find shadow APIs and sensitive data before attackers or auditors do.

| Pillar | Meaning | Status |
| --- | --- | --- |
| **See** | Accurate inventory + schemas + OpenAPI from traffic | Shipped (harden in SF0) |
| **Understand** | Risk, drift, topology, evidence | **This plan** (SF1–SF5) |
| **Act** | Tickets, policies, protect / feed gateway | Later (SF6–SF7) |

### Sell-now packaging (copy/agents; little new product)

These are **sales + UX packaging** of what already exists. Prefer SF8 (marketing/docs) over engineering unless noted.

| Use case | Pitch | Proof in product today |
| --- | --- | --- |
| Docs vs reality | OpenAPI is a wish list; we show what got hit | Inventory hit counts; OpenAPI export |
| PII / secrets in payloads | Find sensitive fields before auditors do | Endpoint signals (email, token, card, …) |
| OpenAPI bootstrap | Traffic → usable OpenAPI in a day | Export button |
| Pre-audit / M&A surface | Multi-service live map without reading every repo | Org → Project → Service inventory |
| Auth coverage gaps | Endpoints that never saw auth in real traffic | `authModes` / `auth_observed` |

---

## Important finding — response traffic already exists

**You are already monitoring response traffic** in all current connectors. Bodies are shaped + redacted client-side; only schemas/signals land in Postgres (no raw body table).

| Connector | How response body is captured |
| --- | --- |
| Express (`@apiglimpse/middleware`) | Wrap `res.json` / `res.send`, sample on `res.on('finish')` |
| Fastify (`@apiglimpse/fastify`) | `onSend` captures payload; `onResponse` enqueues sample |
| FastAPI (Python) | Re-read `body_iterator` for JSON, rebuild `Response` |
| Go chi | `captureWriter` buffers body bytes, JSON-unmarshals after handler |

Agent pipeline already merges `response.bodyShape` → `responseSchema` + sensitive-field signals (`agent/src/pipeline/aggregate.js`).

**Gaps (SF0):** Express misses some paths (`res.end`/`write` streaming, non-JSON `send`, template `render`); large/streamed bodies skipped by design; no explicit “response capture coverage” metrics in UI. Hardening ≠ greenfield build.

---

## How to run in parallel

| Rule | Detail |
| --- | --- |
| One agent per workstream ID (`SF0`…`SF8`) | Avoid two agents editing the same Prisma models or connector packages |
| Respect **Blocked by** | Don’t start SF6 protect before SF1 risk model is stable |
| Shared files | Coordinate: `backend/prisma/schema.prisma`, `agent/src/pipeline/*`, marketing home copy |
| Nick-only | Gateway account access, Slack/Jira OAuth apps, production DNS — not agent secrets |
| Cost | No Railway/Render plan upgrades without asking |

**Suggested first wave (safe parallel):** **SF0 + SF1 + SF8**  
**Second wave:** **SF2 + SF3** (after SF1 schema for findings/alerts exists)  
**Third wave:** **SF4 + SF5**  
**Later:** **SF6 + SF7** (enterprise / protect)

```text
SF0 response capture harden ──┐
SF8 sales packaging (copy) ───┼─► demoable “Understand” story
SF1 risk posture + findings ──┘
         │
         ├─► SF2 drift alerts
         ├─► SF3 topology (caller→endpoint)
         │
         ├─► SF4 evidence / compliance export
         └─► SF5 gateway connector (breadth)

SF6 tickets / integrations  (after SF2)
SF7 protect / policy        (after SF1 + PROTECT_MODE.md)
```

---

## Agent workstreams

### SF0 — Response capture hardening (connectors)

**Goal:** Prove and harden response-body sampling; close Express gaps; document coverage honestly.  
**Depends on:** None.  
**Touches:**

- `packages/middleware/src/index.js` (+ tests)
- `packages/fastify/src/index.js` (+ tests)
- `connectors/python/src/apiglimpse/middleware.py` (+ tests)
- `connectors/go/apiglimpse/middleware.go` (+ tests)
- `packages/shared` (only if envelope fields needed, e.g. `responseCapture: 'json'|'none'|'truncated'`)
- `docs-site/docs/concepts.md`, `docs/TESTING.md`

**Tasks:**

1. Add connector tests: JSON via `res.json`, stringified JSON via `res.send`, empty body, binary skip, large body cap.  
2. Express: optionally wrap `res.end` for string/Buffer JSON when `Content-Type` is JSON; still skip streams.  
3. Emit optional sample meta `responseBodyCaptured: boolean` (or capture mode) so inventory can show “schema from N responses.”  
4. Confirm agent still merges response schemas + response-side signals; fix any path where `bodyShape` is dropped.  
5. Docs: “We sample response *shapes*, not full payloads; streaming/binary not captured.”

**Out of scope:** Full HAR storage, eBPF, reconstructing SSE/multipart.

**Done when:** All four connectors have tests proving JSON response shapes reach the envelope; docs state limitations; no regression on fail-open / latency path.

**Agent prompt:**

> Implement SF0 only per `docs/SALES_FEATURES_PLAN.md`. Harden response body capture across Express/Fastify/Python/Go. Do not add protect mode, alerts, or schema migrations beyond optional envelope metadata. Keep fail-open; never store raw bodies in the DB.

---

### SF1 — Risk posture + findings model

**Goal:** Turn existing `Signal`s into a scored posture view buyers understand (“12 high-risk endpoints”).  
**Depends on:** None for read-model v1 (can derive from `Signal` + `Endpoint.authModes`). Schema only if you persist `Finding` / `EndpointRisk`.  
**Touches:**

- `backend/lib/risk.js` (new) — scoring rules  
- `backend/routes/inventory.js` or `backend/routes/posture.js` (new)  
- `frontend` posture page or inventory summary strip (not a dashboard of cards in the hero sense — one posture section)  
- Optional Prisma: `Finding` table if you need acknowledgment / status  

**Scoring v1 (proposal — lock before coding):**

| Factor | High | Medium | Low |
| --- | --- | --- | --- |
| Sensitive signals | card/ssn/password/secret | email/phone/pii | none |
| Auth | never observed auth on mutating or sensitive routes | cookie-only | bearer observed |
| Status mix | frequent 5xx on sensitive | mixed | healthy |

**Tasks:**

1. `GET /api/services/:id/posture` → `{ score, highCount, mediumCount, endpoints: [...] }`.  
2. Service inventory: severity rollup column + filter “high risk only.”  
3. Org/project rollup later (don’t block service-level).  
4. Unit tests for scorer with fixture endpoints/signals.

**Out of scope:** Ticketing (SF6), email alerts (SF2), topology (SF3).

**Done when:** A service page can answer “what’s risky and why” without reading every endpoint.

**Agent prompt:**

> Implement SF1 only per `docs/SALES_FEATURES_PLAN.md`. Derive risk from existing Endpoint + Signal data. Prefer pure functions + API before new tables. Do not build Slack/Jira or protect mode.

---

### SF2 — Drift / change alerts

**Goal:** Passive inventory becomes an ops loop: new endpoint, new sensitive field, auth regression.  
**Blocked by:** SF1 recommended (shared “finding” language); can ship event detection without SF1 UI.  
**Touches:**

- Ingest or agent flush path: detect deltas on upsert  
- `backend/prisma` — `Alert` / `InventoryEvent` model  
- `backend/routes/alerts.js`  
- `frontend` alerts list / badge  
- Optional: webhook outbound URL on Project/Service settings  

**Event types (v1):**

1. `endpoint.discovered` — new `(method, pathTemplate)`  
2. `signal.appeared` — new sensitive field path on endpoint  
3. `auth.regressed` — previously had bearer/cookie, now seeing `none` (needs careful hysteresis)

**Tasks:**

1. On inventory upsert, compare previous row → append events.  
2. List + mark-read API; service/project filter.  
3. Settings: optional webhook POST JSON (HMAC later).  
4. No email until Resend production is solid (Nick N1).

**Out of scope:** Anomaly ML, per-IP abuse, paging.

**Done when:** Creating a new route in a demo app produces a visible “new endpoint” event within one flush interval.

**Agent prompt:**

> Implement SF2 only per `docs/SALES_FEATURES_PLAN.md`. Add inventory drift events on upsert. Coordinate Prisma with SF1 if both run — prefer one `InventoryEvent` model. Do not implement protect mode.

---

### SF3 — Service / caller topology (blast radius)

**Goal:** Sell “API attack-surface map” — not a generic APM mesh. Show which callers hit which endpoints and where sensitive data lives.  
**Depends on:** Stable inventory (exists). Optional SF0 for richer response headers.  
**Touches:**

- Connector: capture optional caller hints (`x-service-name`, `x-client-name`, `user-agent` class, later API-key identity)  
- Agent aggregate: edge counts `caller → (serviceId, method, pathTemplate)`  
- Prisma: `TrafficEdge` or similar  
- `frontend` simple graph or adjacency list on service/org page  

**MVP edges (no eBPF):**

| Signal | Source |
| --- | --- |
| Explicit service name | Customer sets `API_SENSOR_SERVICE_NAME` or header |
| User-Agent family | browser / sdk / curl / unknown |
| Auth identity | hashed API key prefix only if present (careful PII) |

**Tasks:**

1. Envelope field `caller` / `clientHints` (versioned).  
2. Aggregate edges in agent; upsert counts.  
3. UI: “Who hits this endpoint?” + “Sensitive endpoints by caller.”  
4. Marketing: one sentence under Understand — blast radius, not “network flow monitoring.”

**Out of scope:** Full distributed tracing, TCP/eBPF, cross-cloud mesh.

**Done when:** Demo with two services setting different `x-service-name` shows two caller nodes into a shared API.

**Agent prompt:**

> Implement SF3 only per `docs/SALES_FEATURES_PLAN.md`. Lightweight caller→endpoint edges from headers/config. Do not build eBPF or gateway connectors (SF5). Keep graph UX simple (list + basic SVG ok).

---

### SF4 — Evidence / compliance export

**Goal:** Auditors and CISOs buy **dated evidence**, not discovery for its own sake.  
**Depends on:** Inventory + signals (+ SF1 posture if available).  
**Touches:**

- `backend/lib/evidence.js` — snapshot builder  
- `GET /api/services/:id/evidence` or project-level ZIP/JSON  
- Frontend “Download evidence pack”  
- Docs: what is / isn’t attested  

**Pack contents (v1 JSON + optional PDF later):**

1. Inventory snapshot (method, path, hits, first/last seen, auth modes)  
2. Signals list with severity  
3. OpenAPI document (reuse existing exporter)  
4. Posture summary if SF1 merged  
5. Generated-at timestamp + org/service ids  

**Out of scope:** Legal attestation, continuous compliance automation, SOC2 report writing.

**Done when:** Customer can download a dated pack suitable to attach to an audit questionnaire.

**Agent prompt:**

> Implement SF4 only per `docs/SALES_FEATURES_PLAN.md`. Reuse OpenAPI export. JSON evidence pack first; skip PDF unless trivial. Do not invent compliance certifications in copy.

---

### SF5 — Gateway / proxy connector (breadth)

**Goal:** Discover APIs without instrumenting every app — enterprise unlock.  
**Depends on:** Envelope v1 compatibility; Nick picks first gateway.  
**Touches:** New package under `connectors/` or `packages/`; agent accepts same `/v1/samples`; docs integrating page; marketing connector list.

**First target (pick one before agent starts):**

| Option | Why |
| --- | --- |
| **A. Reverse-proxy access log shipper** | Fastest MVP; path/method/status only (weak schemas) |
| **B. Kong / Nginx Lua / Envoy WASM filter** | Real request/response shapes at edge |
| **C. Cloudflare Worker / AWS API Gateway access logs** | Cloud-native buyers |

**Recommendation:** Start with **B (Kong or Nginx)** *or* a thin **Node reverse-proxy sidecar** that terminates and forwards while sampling — reuses Express capture patterns (SF0).

**Tasks:**

1. Spike ADR in `docs/DECISIONS.md`: chosen gateway + body capture limits.  
2. Ship connector + install docs.  
3. Mark marketing “available” only when publishable.  

**Out of scope:** Nest/Next/Hono app connectors (separate small streams if needed). Protect at gateway (SF7).

**Done when:** Traffic through the gateway appears as a Service inventory without app middleware.

**Agent prompt:**

> Implement SF5 per `docs/SALES_FEATURES_PLAN.md` for the gateway Nick locked in DECISIONS.md. Same envelope v1 as app connectors. Fail-open. Do not modify Stripe/billing.

---

### SF6 — Findings → tickets / Slack (workflow)

**Goal:** Security tools that don’t create work don’t get renewed.  
**Blocked by:** SF2 events (or SF1 findings with status).  
**Touches:** Integrations settings; OAuth or webhook; map event → issue.

**Tasks:**

1. Generic outbound webhook (reuse SF2) documented for Zapier/Make.  
2. Native Slack incoming webhook v1.  
3. Jira/Linear later (OAuth apps = Nick).  

**Out of scope:** Bi-directional sync, auto-remediation.

**Done when:** New high-severity signal can create a Slack message via customer webhook URL.

---

### SF7 — Protect / policy (Act pillar)

**Goal:** Detect → suggest policy → optional enforce; feed WAF with real OpenAPI.  
**Doc of record:** [PROTECT_MODE.md](./PROTECT_MODE.md) (expand, don’t fork).  
**Blocked by:** SF1 risk rules; stable OpenAPI export.  
**Phases:**

1. **Detect-only** — policy suggestions from unauth + sensitive endpoints (UI checklist).  
2. **Observe mode in middleware** — would-block counters, still allow.  
3. **Block mode** — local cached policy, fail-open (per PROTECT_MODE).  
4. **Edge feed** — push OpenAPI to customer WAF (manual download first).

**Out of scope for first protect PR:** Fail-closed defaults, remote authorize per request.

**Agent prompt:**

> Extend `docs/PROTECT_MODE.md` implementation for phase 1–2 only per SF7 in `docs/SALES_FEATURES_PLAN.md`. No fail-closed. Do not break async sampling.

---

### SF8 — Sales packaging (use cases in product + marketing)

**Goal:** Make the five sell-now use cases obvious in UI and site without waiting on SF1–SF7.  
**Depends on:** None. Coordinate copy with [MARKETING_PLAN.md](./MARKETING_PLAN.md).  
**Touches:**

- `marketing/` home + how-it-works (use-case sections; keep hero budget rules)  
- `docs-site` — “Use cases” page  
- Dashboard empty states / inventory filters: Undocumented-ish helpers, “Has sensitive signals”, “No auth observed”  
- Optional: docs vs OpenAPI upload later (import compare = future)

**Tasks:**

1. Marketing section: five use cases → CTAs to get-started.  
2. Inventory filters for signals + authModes.  
3. One-pager internal sales sheet in `docs/ads/` or marketing PDF later.  

**Out of scope:** Fake competitor matrices with invented pricing; ROI calculator fiction.

**Done when:** A prospect can self-serve the story “shadow API + sensitive fields + OpenAPI export” from the site and dashboard alone.

**Agent prompt:**

> Implement SF8 only per `docs/SALES_FEATURES_PLAN.md`. Packaging and filters for existing data. Follow marketing hero/brand rules in user/design rules. Do not invent shipped protect/topology features in copy.

---

## Explicit non-goals (this wave)

- Storing raw request/response bodies in the control plane  
- Customer-hosted agent SKU  
- Full APM / distributed tracing replacement  
- eBPF / Java / .NET connectors  
- Password reset (unless reopened)  
- Fake “AI SOC” chat that doesn’t use inventory data  

---

## Priority if Nick only funds four builds

| Order | Stream | Why |
| --- | --- | --- |
| 1 | **SF2** Drift alerts | Turns inventory into a habit / renewal loop |
| 2 | **SF1** Risk posture | Exec-readable sales demo |
| 3 | **SF3** Topology | Differentiated “blast radius” story |
| 4 | **SF5** Gateway | Removes install-every-service objection |

SF0 is cheap insurance (responses already work — harden + message). SF8 should ride alongside any wave (copy is leverage).

---

## Review checklist for Nick

Decisions locked 2026-08-26:

1. [x] Do as many streams as possible  
2. [x] SF1: **discuss later** — light derived scorer only for now  
3. [x] SF3: **`API_SENSOR_SERVICE_NAME` / `X-Service-Name`** for quality topology  
4. [x] SF5: **Nginx / Kong** first (Node sidecar kept for local/dev)  
5. [x] **Webhook-only** (no Slack-native yet)  
6. [x] Protect MVP: dashboard toggle + single rule; connectors poll `/v1/policy` ~15m (version bump on save)

Integration branch: `cursor/sf-implement-925e`.

---

## Relationship to other plans

| Plan | Role |
| --- | --- |
| [PARALLEL_PLAN.md](./PARALLEL_PLAN.md) | Soft-launch billing / OpenAPI / onboarding — mostly done or in flight |
| [SAAS_PLAN.md](./SAAS_PLAN.md) | Org / seats / RBAC |
| [PROTECT_MODE.md](./PROTECT_MODE.md) | Enforcement design for SF7 |
| [MARKETING_PLAN.md](./MARKETING_PLAN.md) | Site/SEO; SF8 should align, not duplicate |
| [ORG_PLAN_LIMITS.md](./ORG_PLAN_LIMITS.md) | Plan caps — posture/alerts must respect existing limits |
