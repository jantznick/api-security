# Connectors wave 2 — parallel agent plan

**Audience:** Nick reviews → launches parallel agents.  
**Related:** [WIRE_PROTOCOL.md](./WIRE_PROTOCOL.md), [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md), [INTEGRATING.md](./INTEGRATING.md), [DECISIONS.md](./DECISIONS.md) (Nginx/Kong first for gateways), [PARALLEL_PLAN.md](./PARALLEL_PLAN.md).

This is the reviewable plan of record for the **next connector epic** (after Express / Fastify / FastAPI / Go chi).

---

## Terminology (unchanged)

| Term | Meaning |
| --- | --- |
| **Hosted agent** | One multi-tenant collector at `collect.apiglimpse.com` |
| **Connector** | SDK / filter / plugin that POSTs envelope **v1** to that agent |

No per-language collectors. New work is packages that speak [WIRE_PROTOCOL.md](./WIRE_PROTOCOL.md).

---

## Scope of this epic

| Track | Targets | Why |
| --- | --- | --- |
| **A — JS frameworks** | NestJS, Next.js | Cheap breadth on Node; Nest wraps Express/Fastify; Next is App Router quirk surface |
| **B — Enterprise** | Spring Boot (Java), ASP.NET Core (C#) | Legacy / enterprise credibility; Maven + NuGet |
| **C — Python breadth** | Django, Flask | Extend existing `apiglimpse` PyPI core beyond FastAPI |
| **D — Edge / long path** | Nginx (OpenResty) → Kong polish | Platform install without per-app SDKs; Nginx Lua MVP already sketched |

**Explicitly out of this epic:** Hono (optional add-on), Envoy/eBPF, protect-mode inside gateways, rewriting the hosted agent.

---

## Current baseline (do not rebuild)

| Asset | Status |
| --- | --- |
| Express / Fastify / FastAPI / Go chi | Shipped in-repo |
| `@apiglimpse/shared` envelope v1 + fixtures | Shipped |
| `@apiglimpse/gateway-proxy` | Node sidecar for local/dev |
| `connectors/nginx/apiglimpse.lua` | **MVP sketch** — needs prod packaging, tests, demo, docs flip |
| `connectors/kong/README.md` | Outline only — thin follow-on after Nginx |

---

## How to run in parallel

| Rule | Detail |
| --- | --- |
| One agent per workstream ID (`C2-*`) | Avoid two agents editing the same tree |
| Shared protocol only via [WIRE_PROTOCOL.md](./WIRE_PROTOCOL.md) + `packages/shared/fixtures` | Do not invent envelope v2 |
| No `agent/` / `ingest/` pipeline edits | Collector stays language-agnostic |
| Docs / marketing / `installSnippets.js` | Prefer **C2-DOC** after connectors merge, or carefully scoped per-PR rows |
| Publishing | Nick-only (npm / PyPI / Maven Central / NuGet / luarocks) — [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md) will need registry sections when packages land |

### Suggested waves

```text
Wave A (safe parallel, JS):     C2-NEST + C2-NEXT
Wave B (safe parallel, JVM/.NET): C2-SPRING + C2-ASPNET
Wave C (Python, after/with A):  C2-DJANGO + C2-FLASK  (share connectors/python core — serialize if same files)
Wave D (long path):             C2-NGINX  then  C2-KONG (Kong blocked by Nginx sampler quality)
Wave E (docs/UX):               C2-DOC
```

**File-conflict note:** `C2-DJANGO` and `C2-FLASK` both touch `connectors/python/`. Prefer **one agent** for both (`C2-PY-WSGI`) **or** land a shared WSGI/ASGI helper first (`C2-PY-CORE`) then parallel thin adapters.

---

## Shared “done when” (every app connector)

- [ ] Captures method, path, status, latency, headers, body shapes
- [ ] Redaction matches envelope v1 fixtures
- [ ] Fail-open buffer + flush + circuit breaker
- [ ] `POST {agentUrl}/v1/samples` + `X-API-Key`
- [ ] Demo under `demo/<stack>-app/`
- [ ] Unit/integration tests vs fixtures (or language-local golden JSON)
- [ ] README + customer install snippet
- [ ] Does **not** change agent/ingest schema

Gateway connectors additionally:

- [ ] Works without app SDK install
- [ ] Metadata-first (method/path/status always); body best-effort / size-capped
- [ ] Documents OpenResty vs stock Nginx requirements
- [ ] Sets caller / `API_SENSOR_SERVICE_NAME` for topology quality ([DECISIONS.md](./DECISIONS.md))

---

## Workstreams

### C2-NEST — NestJS connector

**Goal:** Nest module that applies Express or Fastify under the hood (reuse `@apiglimpse/middleware` / `@apiglimpse/fastify`).  
**Depends on:** Existing Express + Fastify packages.  
**Touches:**

- `packages/nestjs/` (new) — `@apiglimpse/nestjs`
- `demo/nestjs-app/`
- Tests: module boots on Express adapter + Fastify adapter

**Prefer:** Nest middleware / interceptor that delegates to existing Node connectors — **do not** reimplement capture three times.

**Out of scope:** Next.js, Java, gateway.

**Blocked by:** Nothing (wave A).

---

### C2-NEXT — Next.js connector

**Goal:** App Router–friendly sampling for Route Handlers / middleware.  
**Depends on:** Envelope fixtures; design note required (body consumption).  
**Touches:**

- `packages/next/` (new) — `@apiglimpse/next`
- `demo/next-app/` (App Router)
- Docs: explicit limitations (Edge runtime, streaming, `request.json()` once)

**Risks:** Highest JS quirk surface — isolate ownership from Nest. Prefer wrapping `fetch`/handler helpers over global monkey-patches.

**Out of scope:** Pages Router deep support (nice-to-have footnote only).

**Blocked by:** Nothing (wave A), but expect longer iteration than Nest.

---

### C2-SPRING — Spring Boot (Java)

**Goal:** First-class Java connector on Maven Central coordinates (e.g. `com.apiglimpse:apiglimpse-spring-boot-starter`).  
**Touches:**

- `connectors/java/` (or `connectors/spring/`) — Gradle/Maven multi-module
  - envelope + redaction parity with fixtures
  - `Filter` / `OncePerRequestFilter` (Servlet) MVP
  - Optional WebFlux note as follow-up (not required for v1)
- `demo/spring-boot-app/`
- Tests: JUnit against golden JSON

**Publish later (Nick):** Sonatype / Maven Central — extend [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md).

**Out of scope:** Quarkus/Micronaut; protect mode; full body replay.

**Blocked by:** Nothing (wave B). May run parallel with ASP.NET.

---

### C2-ASPNET — ASP.NET Core

**Goal:** NuGet package (e.g. `ApiGlimpse.AspNetCore`) with pipeline middleware.  
**Touches:**

- `connectors/dotnet/` — `ApiGlimpse.AspNetCore` project + tests
- `demo/aspnet-app/`
- Envelope/redaction parity; fail-open `HttpClient` flush

**Publish later (Nick):** nuget.org — extend CONNECTOR_PUBLISH.

**Out of scope:** Classic .NET Framework / OWIN-only (footnote OK).

**Blocked by:** Nothing (wave B).

---

### C2-PY-CORE — Shared Python WSGI/ASGI helpers (optional first)

**Goal:** Extract flush/redaction/client already in `connectors/python` into reusable pieces for Django/Flask without duplicating FastAPI middleware.  
**Touches:** `connectors/python/src/apiglimpse/` only (no FastAPI behavior regressions).  
**Blocked by:** Nothing. **Do this before** Django/Flask if two agents would otherwise fight.

If a single agent owns Django+Flask, this can be an internal step of **C2-PY-WSGI** instead of its own PR.

---

### C2-DJANGO — Django connector

**Goal:** Django middleware class in `apiglimpse` (same PyPI package or `apiglimpse[django]` extra).  
**Touches:** `connectors/python/` (django middleware module), `demo/django-app/`, tests.  
**Depends on:** C2-PY-CORE **or** exclusive ownership of `connectors/python` for the duration.  
**Out of scope:** Django Channels / WebSockets.

---

### C2-FLASK — Flask connector

**Goal:** Flask extension / `before_request` + `teardown_request` (or WSGI middleware wrapper).  
**Touches:** `connectors/python/`, `demo/flask-app/`, tests.  
**Depends on:** Same as Django — serialize with C2-DJANGO on `connectors/python`.

**Recommended alternate:** One stream **C2-PY-WSGI** = Django + Flask in one PR/agent to avoid merge pain.

---

### C2-NGINX — Nginx / OpenResty productionization (long path)

**Goal:** Turn the Lua MVP into an installable, tested gateway connector enterprises can run.  
**Depends on:** Existing `connectors/nginx/apiglimpse.lua` + [DECISIONS.md](./DECISIONS.md) SF5.  
**Touches:**

- `connectors/nginx/` — harden sampler (circuit breaker, batching, redaction parity, body size caps)
- OpenResty `docker-compose` / `demo/nginx-openresty/`
- Integration test (e.g. curl through Nginx → mock `/v1/samples`)
- Packaging notes: how to drop Lua on OpenResty; document **stock Nginx without Lua is unsupported**
- Customer docs section under INTEGRATING “Gateway”
- Optional: rockspec / release artifact layout for later luarocks

**Non-goals (v1):** Protect enforcement; full body capture; Envoy; replacing `@apiglimpse/gateway-proxy` (keep proxy for Node sidecar demos).

**Why “long”:** Ops packaging, OpenResty version matrix, safe `log_by_lua` / body reader limits, and enterprise install docs — not just another npm package.

**Blocked by:** Nothing to start; should finish before Kong claims “available.”

---

### C2-KONG — Kong plugin (follow-on)

**Goal:** Real Kong plugin (Lua preferred) wrapping the same sampling contract as Nginx.  
**Depends on:** **C2-NGINX** sampler quality + shared mental model.  
**Touches:** `connectors/kong/` (replace README-only sketch), demo Kong compose, docs.

**Out of scope:** Kong Mesh / WASM plugin v1.

---

### C2-DOC — Docs, marketing, dashboard snippets

**Goal:** Flip “Coming soon” → install paths; add snippets to `frontend/src/lib/installSnippets.js` and docs-site.  
**Depends on:** At least one of Nest/Next **or** Spring/ASP.NET **or** Django/Flask **or** Nginx merged.  
**Touches:**

- `docs/INTEGRATING.md`, `docs-site/docs/**`
- `marketing/` connector tables
- `frontend/src/lib/installSnippets.js` + Project settings UI if needed
- [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md) — Maven Central + NuGet + luarocks sections when packages exist

**Rule:** Only mark **Available** when registry-publishable (or git-tag install for Go-style) and demo works.

---

## Dependency graph

```text
                    ┌─ C2-NEST ──────────────┐
Wave A (JS) ────────┼─ C2-NEXT ──────────────┤
                    └────────────────────────┤
Wave B (enterprise) ┌─ C2-SPRING ────────────┤
                    └─ C2-ASPNET ────────────┤
Wave C (Python)     C2-PY-CORE? ─► C2-DJANGO ┤──► C2-DOC
                         └──────► C2-FLASK ──┤
                    (or single C2-PY-WSGI)   │
Wave D (gateway)    C2-NGINX ──► C2-KONG ────┘
```

Safe first parallel launch: **C2-NEST + C2-NEXT + C2-SPRING + C2-ASPNET + C2-NGINX**.  
Add **C2-PY-WSGI** (or Django then Flask) in the same wave if an agent is free.  
**C2-KONG** and **C2-DOC** after green connectors.

---

## Suggested agent prompts (copy-paste)

**C2-NEST:**  
> Implement NestJS connector per `docs/CONNECTORS_WAVE2_PLAN.md` workstream C2-NEST only. Reuse `@apiglimpse/middleware` and/or `@apiglimpse/fastify`; do not reimplement capture. Add `demo/nestjs-app`. Do not touch Java, .NET, Python, or nginx.

**C2-NEXT:**  
> Implement Next.js App Router connector per C2-NEXT in `docs/CONNECTORS_WAVE2_PLAN.md`. Document body-read limitations. Add `demo/next-app`. Do not modify Nest, agent/, or gateway Lua.

**C2-SPRING:**  
> Implement Spring Boot starter per C2-SPRING in `docs/CONNECTORS_WAVE2_PLAN.md`. Match envelope v1 fixtures. Servlet filter MVP. Add `demo/spring-boot-app` and tests. Do not touch Node packages or nginx.

**C2-ASPNET:**  
> Implement ASP.NET Core middleware per C2-ASPNET in `docs/CONNECTORS_WAVE2_PLAN.md`. Match envelope v1. Add `demo/aspnet-app` and tests. Do not touch Java or Node connector packages.

**C2-PY-WSGI:**  
> Add Django and Flask adapters to `connectors/python` per C2-DJANGO + C2-FLASK in `docs/CONNECTORS_WAVE2_PLAN.md` (single agent). Keep FastAPI working. Add `demo/django-app` and `demo/flask-app`. Do not touch Java/.NET/nginx.

**C2-NGINX:**  
> Productionize `connectors/nginx` per C2-NGINX in `docs/CONNECTORS_WAVE2_PLAN.md`. Harden Lua sampler, add OpenResty demo + tests, customer gateway docs. Do not implement Kong plugin beyond keeping README accurate. No protect mode at the gateway.

**C2-DOC (later):**  
> Update INTEGRATING, docs-site, marketing, and installSnippets for connectors that are actually merged per C2-DOC. Only flip status to Available for shipped connectors.

---

## Nick checklist before launching agents

1. [ ] Confirm wave mix: recommended **NEST + NEXT + SPRING + ASPNET + NGINX** first  
2. [ ] Python: **one** agent for Django+Flask (`C2-PY-WSGI`) vs two serialized agents  
3. [ ] Java groupId / artifact naming (`com.apiglimpse` …)  
4. [ ] NuGet package id (`ApiGlimpse.AspNetCore` …)  
5. [ ] Nginx: OpenResty-only is acceptable for v1 (stock Nginx without Lua = unsupported)  
6. [ ] Who owns Maven Central / NuGet / luarocks accounts (Nick-only)  
7. [ ] Do **not** mark gateway “Available” until C2-NGINX demo + docs land (Lua sketch alone is not enough)

---

## Relationship to other plans

| Plan | Scope |
| --- | --- |
| [PARALLEL_PLAN.md](./PARALLEL_PLAN.md) | SaaS product streams (billing, orgs, …) |
| [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md) | How to publish shipped connectors |
| **This doc** | Wave 2 connector implementation workstreams |

Product agents may run in parallel with connector agents if they avoid `packages/*` connectors, `connectors/*`, and `demo/*` trees listed above.
