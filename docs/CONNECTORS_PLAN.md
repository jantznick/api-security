# Language connectors plan — API Glimpse

**Audience:** Nick reviews → launches parallel agents.  
**Related:** [PARALLEL_PLAN.md](./PARALLEL_PLAN.md) (product workstreams W1–W8), [PRODUCTIZATION.md](./PRODUCTIZATION.md) Phase 3, [INTEGRATING.md](./INTEGRATING.md).

Plan mode is unavailable in the current Cloud Agent session; this doc is the reviewable plan of record for **more language / framework connectors**.

---

## Terminology (important)

| Term | Meaning | Count today |
| --- | --- | --- |
| **Hosted agent** (`agent/`) | One multi-tenant collector at `collect.apiglimpse.com` | **1** (Node/Express service) |
| **Connector** | SDK / middleware in the customer app that samples traffic and POSTs to the agent | **1** (Express `@apiglimpse/middleware`) |

**We are not adding more “language agents.”** Product path is locked: one hosted multi-tenant agent; customers install **connectors** that speak the same wire protocol ([PRODUCTIZATION.md](./PRODUCTIZATION.md), [DECISIONS.md](./DECISIONS.md)).

“Parallel mode” here means **parallel Cursor agents**, one per connector workstream (`C0`…`C7`) — same pattern as `W1`…`W8` in [PARALLEL_PLAN.md](./PARALLEL_PLAN.md).

---

## Current state

```
Customer Express app
  → @apiglimpse/middleware  (only connector)
    → POST collect…/v1/samples  (envelope v1)
      → agent pipeline → ingest upsert → Postgres
        → Dashboard
```

| Surface | Status |
| --- | --- |
| Hosted agent `POST /v1/samples` | Live; accepts any client that sends envelope v1 |
| `@apiglimpse/shared` | JS envelope + redaction (reference contract) |
| `@apiglimpse/middleware` | Express only |
| Fastify / Nest / Next / Hono / FastAPI / Go (chi) / proxy | Docs + marketing “Coming soon” only — **no code** |
| Dashboard install snippet | Express-only (`ProjectSettings.jsx`) |

**Implication:** New languages need **new connector packages**, not a new agent service. If the JSON envelope matches, the cloud side usually needs **zero** pipeline changes.

---

## Wire contract (freeze before coding connectors)

Source of truth: `packages/shared` (`envelope.js`, `redaction.js`).

### Envelope

```json
{
  "version": 1,
  "apiKey": "ask_…",
  "samples": [ /* Sample[] */ ],
  "sentAt": "ISO-8601"
}
```

### Sample (required fields)

| Field | Notes |
| --- | --- |
| `method`, `path`, `statusCode`, `latencyMs`, `authObserved`, `timestamp` | Path is as seen by the app (agent templates it) |
| `request` / `response` | `contentType`, `headerNames`, `headers` (redacted), `bodyShape` |

### Behavioral contract (every connector)

1. **Fail-open** — never block or fail the customer request because of API Glimpse.
2. **Async flush** — buffer + periodic / max-batch POST; circuit breaker on collector failures.
3. **Client-side redaction** — strip secrets before leave-app (mirror `SENSITIVE_HEADER_NAMES` + `shapeBody` caps).
4. **Auth** — `X-API-Key` header (and envelope `apiKey`).
5. **Env** — `API_SENSOR_AGENT_URL`, `API_SENSOR_KEY`, optional `API_SENSOR_SAMPLE_RATE`.
6. **Target** — `POST {agentUrl}/v1/samples` → expect `202`.

Non-JS connectors **reimplement** redaction/shaping to match envelope v1 (do not depend on `@apiglimpse/shared` from Python/Go). Keep a **golden fixture** so all languages stay compatible (see **C0**).

---

## Prerequisite (before heavy multi-connector traffic)

Docs claim per-project aggregators + key validation before 202. Current `agent/src/server.js` still uses a **single global** `InventoryAggregator` and does not wire `keyResolver.js` / `rateLimit.js`. Ingest introspect exists under `ingest/routes/auth.js` but may not be fully mounted depending on deploy generation.

| ID | Work | Why |
| --- | --- | --- |
| **C0a** | Wire API-key validation (introspect) before 202; invalid → 401, no aggregate | Multi-tenant safety as connector count grows |
| **C0b** | Per-project (or per-key) in-memory aggregators + flush with that key | Avoid cross-tenant bleed / wrong-key upserts |
| **C0c** | Golden envelope fixtures + conformance tests in `packages/shared` | Parallel connector agents need a shared “done when” |

**Recommendation:** Land **C0** (shared foundation) **before** or as the first commit of wave 1. Connector streams may start after fixtures exist even if C0a/C0b land in parallel on `agent/` + `ingest/` only.

---

## Priority order

Product docs already list this matrix. Recommended build order by **reach × differentiation × reuse**:

| Priority | Connector | Package / module (proposed) | Why this order |
| --- | --- | --- | --- |
| 1 | **Fastify** | `@apiglimpse/fastify` (or extend middleware pkg) | Same language as Express; high Node overlap; validates JS multi-framework pattern |
| 2 | **FastAPI** | `apiglimpse` (PyPI) | First non-JS; Python is the main “language agent” ask |
| 3 | **Go (chi)** | `github.com/…/apiglimpse` (module) | Second language; chi matches docs promise |
| 4 | **Hono** | `@apiglimpse/hono` | Small surface; edge/workers story |
| 5 | **NestJS** | `@apiglimpse/nestjs` | Wraps Express/Fastify under the hood — often thin adapter on #1 |
| 6 | **Next.js** | `@apiglimpse/next` | Route Handlers / middleware; more framework quirks |
| 7 | **Proxy / gateway** | Later epic | Different shape (not in-app SDK); see Protect / edge later |

Do **not** start proxy/gateway or Java/.NET in this epic ([DECISIONS.md](./DECISIONS.md) deferred eBPF / Java / Envoy).

---

## How to run in parallel

| Rule | Detail |
| --- | --- |
| One agent per workstream ID (`C0`…`C7`) | Avoid two agents editing the same files |
| Shared protocol only via **C0 fixtures** | Do not each invent a slightly different JSON shape |
| No edits to `agent/` pipeline in connector streams | Cloud collector stays language-agnostic |
| Docs/marketing status tables | Prefer **one** stream (`C7`) after connectors merge, or carefully scoped per-PR rows |
| Publishing | Nick-only for npm/PyPI/Go module accounts (like N2) |

### Suggested waves

```text
Wave 0 (foundation):     C0
Wave 1 (safe parallel):  C1 Fastify + C2 FastAPI + C3 Go chi
Wave 2:                  C4 Hono + C5 Nest (after C1) + C6 Next (after C1)
Wave 3 (docs/UX):        C7 dashboard snippets + docs/marketing status flip
```

---

## Shared “done when” checklist (every connector)

Copy into each PR:

- [ ] Middleware / hook captures method, path, status, latency, headers, bodies (shape only)
- [ ] Redaction matches shared rules (sensitive headers + secret-ish body fields)
- [ ] Buffer + flush + circuit breaker; fail-open on request path
- [ ] Sends envelope `version: 1` to `/v1/samples` with `X-API-Key`
- [ ] Demo app under `demo/<stack>-app/` that shows inventory in local stack
- [ ] Unit or integration test: shaped sample matches C0 golden fixture (or subset)
- [ ] README install: env vars + 5–10 line mount example
- [ ] Does **not** change agent/ingest/core schema

---

## Workstreams

### C0 — Protocol foundation (do first)

**Goal:** Freeze envelope v1 as a testable contract; harden agent tenancy for more senders.  
**Touches:**

- `packages/shared/` — golden fixtures (`fixtures/envelope-v1.json`, sample shapes)
- Optional: `packages/shared` export of fixture paths / JSON for Node tests
- `agent/src/server.js`, `agent/src/lib/keyResolver.js`, `agent/src/lib/rateLimit.js`
- `ingest/routes/auth.js` + mount in `ingest/server.js` if missing
- Short note in `docs/INTEGRATING.md` “Wire protocol” subsection (or link)

**Tasks:**

1. Extract 1–2 golden envelopes from current Express middleware behavior.  
2. Add Node tests that `validateEnvelope` + redaction produce stable shapes.  
3. Wire key introspect before 202; per-key aggregators; rate limit basic.  
4. Document “implementing a connector” contract in one page (fields + fail-open).

**Out of scope:** Any new framework middleware.

**Blocked by:** Nothing.

---

### C1 — Fastify connector

**Goal:** Second Node connector; prove multi-framework without new language.  
**Depends on:** C0 fixtures (at least).  
**Touches:**

- New: `packages/fastify/` (or `packages/middleware/src/fastify.js` if you prefer one npm package — **decide in review**: separate package keeps publish/versioning clean)
- `demo/fastify-app/`
- Tests against C0 fixtures

**Framework hooks:** `onRequest` / `onResponse` (or `preHandler` + `onSend`) to capture bodies without breaking serialization.

**Out of scope:** Nest/Next wrappers.

---

### C2 — FastAPI (Python) connector

**Goal:** First non-JS language connector.  
**Depends on:** C0 fixtures (JSON only).  
**Touches:**

- New top-level or `packages/python/` (e.g. `connectors/python/apiglimpse/`) with `pyproject.toml`
- ASGI / FastAPI middleware
- `demo/fastapi-app/`
- Tests: golden JSON equality (load C0 fixture expectations)

**Reimplement:** `shape_body`, header redaction, envelope builder, async flush + circuit breaker.

**Publish later (Nick):** PyPI `apiglimpse`.

**Out of scope:** Django/Flask (follow-ups can share the Python core client).

---

### C3 — Go (chi) connector

**Goal:** Second language; matches “Go (chi)” in docs.  
**Depends on:** C0 fixtures.  
**Touches:**

- New `connectors/go/` (module) with `middleware` for `chi` / `net/http`
- `demo/go-chi-app/`
- Tests comparing marshaled JSON to fixtures

**Notes:** Body capture via `middleware` wrapping `http.ResponseWriter`; be careful with streaming. Same fail-open / buffer semantics.

**Out of scope:** gin/echo adapters (thin wrappers later).

---

### C4 — Hono connector

**Goal:** Lightweight TS connector for edge-friendly stacks.  
**Depends on:** C0; optionally share code with Express via small internal helper in a TS package.  
**Touches:** `packages/hono/`, `demo/hono-app/`

**Out of scope:** Cloudflare-specific product packaging beyond “works on Node / Bun / workers if fetch exists.”

---

### C5 — NestJS connector

**Goal:** Nest module that applies Express or Fastify adapter under the hood.  
**Depends on:** **C1** (Fastify) and existing Express middleware.  
**Touches:** `packages/nestjs/`, thin `NestModule` / interceptor or middleware consumer, `demo/nestjs-app/`

**Prefer:** Re-export / wrap `@apiglimpse/middleware` + Fastify connector rather than a third capture implementation.

---

### C6 — Next.js connector

**Goal:** App Router Route Handlers + optional instrumentation.  
**Depends on:** C0; design note required (Next body consumption is awkward).  
**Touches:** `packages/next/`, `demo/next-app/`

**Risk:** Highest JS quirk surface — isolate from C1/C5 file ownership.

---

### C7 — Docs, marketing, dashboard install UX

**Goal:** Flip “Coming soon” → real install paths; multi-snippet picker.  
**Depends on:** At least one of C1–C3 merged.  
**Touches:**

- `docs/INTEGRATING.md`, `docs-site/docs/**`
- `marketing/src/pages/HowItWorks.jsx`, `Home.jsx`
- `frontend/src/pages/ProjectSettings.jsx` — language/framework tabs for install snippet
- Empty inventory copy if it hardcodes Express

**Rule:** Only mark a connector “Available” when package is publishable and demo works.

---

## Explicit non-goals

- Second hosted agent process / per-language collector  
- Customer-hosted agent SKU  
- Rewriting agent in Go (unless CPU-bound later)  
- Java / .NET / eBPF / Envoy in this epic  
- Changing envelope to v2 mid-wave (bump only via C0 + coordinated release)  
- Protect-mode hooks ([PROTECT_MODE.md](./PROTECT_MODE.md)) inside new connectors beyond leaving extension points alone  

---

## Dependency graph

```text
C0 fixtures + agent key tenancy
   │
   ├─► C1 Fastify ─┬─► C5 NestJS
   │               └─► C6 Next (soft)
   ├─► C2 FastAPI
   ├─► C3 Go chi
   └─► C4 Hono
            │
            └─► C7 docs / marketing / dashboard snippets
```

---

## Suggested agent prompts (copy-paste)

**C0:**  
> Implement protocol foundation per `docs/CONNECTORS_PLAN.md` workstream C0 only. Add golden envelope fixtures under `packages/shared`, wire agent API-key validation + per-key aggregators, mount ingest introspect if needed. Do not add Fastify/Python/Go connectors.

**C1:**  
> Implement Fastify connector per `docs/CONNECTORS_PLAN.md` C1. Match envelope v1 fixtures from C0. Add `demo/fastify-app`. Do not modify agent pipeline or Python/Go trees.

**C2:**  
> Implement FastAPI/Python connector per `docs/CONNECTORS_PLAN.md` C2. Reimplement redaction to match envelope v1 fixtures. Fail-open async flush. Add `demo/fastapi-app`. Do not touch Node middleware packages or agent/.

**C3:**  
> Implement Go chi connector per `docs/CONNECTORS_PLAN.md` C3. Match envelope v1 JSON fixtures. Add `demo/go-chi-app`. Do not modify packages/middleware or agent pipeline.

**C7 (after connectors land):**  
> Update docs, marketing connector tables, and ProjectSettings install snippets per C7 for connectors that are actually merged. Only flip status to Available for shipped connectors.

---

## Review checklist for Nick

Before launching parallel connector agents, confirm:

1. [ ] Accept terminology: **connectors** → one hosted agent (not per-language agents)  
2. [ ] Wave 1 set: recommended **C0 then C1 + C2 + C3**  
3. [ ] Package layout: monorepo `packages/*` for JS; `connectors/python`, `connectors/go` for others (or your preferred layout)  
4. [ ] npm: new `@apiglimpse/fastify` vs single `@apiglimpse/middleware` multi-export  
5. [ ] Whether **C0a/C0b agent tenancy** must merge before any connector PR hits production collect URL  
6. [ ] Who publishes: npm / PyPI / Go module (Nick-only, like N2)

---

## Relationship to PARALLEL_PLAN.md

| Plan | Scope |
| --- | --- |
| [PARALLEL_PLAN.md](./PARALLEL_PLAN.md) | SaaS product: billing, onboarding, OpenAPI, orgs, protect |
| **This doc** | Connector breadth (Phase 3 productization) |

Safe to run **connector wave 1** in parallel with product streams that do **not** touch `packages/middleware`, `packages/shared`, or `agent/` (e.g. OpenAPI/billing UI). If a product agent needs `shared` or `agent`, serialize with **C0**.
