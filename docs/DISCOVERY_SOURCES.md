# Multi-source API discovery — plan of record

**Audience:** Nick (product direction) + future agents.  
**Status:** Proposed — not implemented.  
**Related:** Traffic inventory today ([ARCHITECTURE.md](./ARCHITECTURE.md)), gateway breadth ([DECISIONS.md](./DECISIONS.md) SF5), sales narrative ([SALES_FEATURES_PLAN.md](./SALES_FEATURES_PLAN.md)).

---

## Problem

API Glimpse today discovers endpoints **only from live traffic** (app connectors + gateway samplers). That is the gold standard for “what is actually hit,” but it is incomplete for owned estates:

| Blind spot | Why traffic alone misses it |
| --- | --- |
| Cold / zombie routes | Never called in the observation window |
| Pre-prod / rarely used admin APIs | Low or zero sample hits |
| Declared but unused gateway routes | Exist in config, not in RPS |
| JS-bundled client paths | Present in SPA assets, not yet exercised |
| Cross-cloud inventory | No single pane without connectors everywhere |

Wiz’s **API Endpoints** inventory already covers part of this (cloud API gateways, runtime sensor, ASM, Red Agent crawl). The question is not “replace Wiz” — it is **what else to fuse**, and how Glimpse stays the place that turns discovery into schemas, risk, OpenAPI, and (later) protect.

---

## Product shape

**One inventory, many evidence sources.**

```text
                    ┌─────────────────┐
  Wiz GraphQL  ────►│                 │
  OpenAPI / Git────►│  Source adapters│──► normalize ──► merge ──► Endpoint
  Crawl / HAR  ────►│  (owned props)  │         │              (+ SourceEvidence)
  Gateway cfg  ────►│                 │         ▼
  Traffic (today)──►└─────────────────┘    InventoryEvent
```

- **Traffic** remains the richest source (hit counts, schemas, signals, auth modes).
- **External sources** contribute *existence + metadata* and provenance tags.
- Merge key stays `(serviceId, method, pathTemplate)` — same as today.
- Every contribution records **which source** saw it and **when**.

This is how Noname/Traceable/Salt-style platforms work: traffic is core; specs, gateways, and scanners fill gaps.

---

## Source catalog (owned properties only)

Assume credentials and allowlists for properties you own. No unsolicited scanning of third parties.

### Tier A — High leverage, low friction (build first)

| Source | What you get | Gaps vs traffic | How to ingest |
| --- | --- | --- | --- |
| **Wiz API Endpoints** | Host, path, method, auth scheme, exposure, linked cloud resources; continuous | Usually no request/response body schemas or Glimpse-style sensitive-field signals | Service account → Wiz GraphQL (`list` / query API endpoints) → adapter |
| **Published OpenAPI / Swagger** | Declared contract | Docs drift; may include never-deployed paths | Fetch `/openapi.json`, `/swagger.json`, Apigee/AWS export, or git path |
| **API gateway config** | Routes as configured (Kong declarative, AWS API Gateway, Azure APIM, Apigee — overlap with Wiz) | Config ≠ runtime behavior | Pull from vendor APIs or git ops repos |
| **Existing Glimpse traffic** | Live truth + schemas | Coverage = instrumented services only | Already shipped |

Wiz specifically discovers via (per Wiz API SPM docs): agentless cloud-gateway integrations (AWS API Gateway, Azure APIM, GCP API Gateway / Apigee), runtime sensor traffic, external ASM scanning, and Red Agent crawling. **Importing Wiz is the fastest way to get that breadth into Glimpse without rebuilding those collectors.**

### Tier B — Active / crawl (powerful on owned apps with login)

| Tool / approach | Role | Notes |
| --- | --- | --- |
| **Authenticated browser crawl** (Playwright) | Drive SPA with real session; record `fetch` / XHR | Best for modern frontends; harvests real API paths clients call |
| **Katana / hakrawler / gospider** | HTML/JS link + endpoint extraction | Fast breadth; noisy without allowlist + auth cookies |
| **mitmproxy / HAR upload** | Passive capture during manual QA | Great for “give me a day of browsing” dumps |
| **Kiterunner / ffuf (API wordlists)** | Probe likely routes on owned hosts | Use only on allowlisted hosts; rate-limit; prefer read-only methods |

Crawl does **not** replace traffic sensors. It finds candidates; traffic (or a safe probe) confirms and enriches.

### Tier C — Code & platform (optional later)

| Source | Role |
| --- | --- |
| Static route extraction (Express/FastAPI/Spring/ASP.NET route tables) | Declared handlers before traffic |
| GraphQL introspection (authenticated) | Schema → synthetic “endpoints” or operation inventory |
| CDN / LB access logs (ALB, Cloudflare, Nginx) | High-volume path enumeration without app SDK |
| eBPF / service mesh taps | Enterprise path; heavy ops |

---

## What Wiz gives you vs what Glimpse should still own

| Capability | Wiz | Glimpse (today / target) |
| --- | --- | --- |
| Estate-wide API list + cloud toxic combinations | Strong | Weak without import |
| Exposure / ASM / attack-path context | Strong | Not a goal to duplicate |
| Request/response **schema merge** from live traffic | Limited / different model | Core product |
| Sensitive field tags in payloads | Different posture model | Core product |
| OpenAPI export from *observed* reality | — | Shipped |
| Drift: docs vs traffic vs cloud inventory | Needs fusion | **Natural Glimpse job** |
| Protect / policy later | Separate | [PROTECT_MODE.md](./PROTECT_MODE.md) |

**Recommendation:** Treat Wiz as a **Tier A feed**, not a competitor. Sell (and build) the **correlation layer**:

- In Wiz only → “cloud knows it; we never saw traffic” (zombie / uninstrumented)
- In traffic only → “shadow relative to Wiz / gateway inventory”
- In OpenAPI only → “documented but dead”
- In crawl only → “client knows a path; server not observed yet”

---

## Data model sketch (additive)

Do **not** replace `Endpoint`. Add provenance:

```prisma
enum DiscoverySourceKind {
  traffic
  wiz
  openapi
  gateway_config
  crawl
  har
  code
  access_log
}

model EndpointSourceEvidence {
  id           String              @id @default(uuid())
  endpointId   String
  endpoint     Endpoint            @relation(...)
  kind         DiscoverySourceKind
  /// External id (e.g. Wiz endpoint id, OpenAPI operationId)
  externalId   String?
  /// Host / asset / crawl run id
  assetKey     String?
  firstSeenAt  DateTime            @default(now())
  lastSeenAt   DateTime            @default(now())
  metadata     Json                @default("{}")
  @@unique([endpointId, kind, externalId])
  @@index([endpointId])
}
```

Optional on `Endpoint`:

- `discoveryKinds String[]` — denormalized for filters (“Wiz only”, “traffic confirmed”)
- `confirmedByTraffic Boolean` — true when any traffic evidence exists

Upsert rules:

1. Traffic upserts behave as today (counts, schemas, signals).
2. Non-traffic adapters upsert **existence** with `hitCount` unchanged (or `0` if new).
3. Path templating reuses agent heuristics (or shared lib) so `/users/1` collapses consistently across sources.
4. New event types: `endpoint.discovered.wiz`, `endpoint.discovered.crawl`, `endpoint.source.confirmed` (first traffic after external-only).

---

## Adapter architecture

Keep ingest private. Add a **discovery worker** (or core jobs) that never sits on the request path:

```text
connectors/discovery/
  wiz/          # GraphQL client + mapper
  openapi/      # parse OAS3 → method/path rows
  crawl/        # wrap Playwright / Katana output → rows
  har/          # HAR → rows
shared normalize → POST ingest /v1/inventory/upsert  (extended) 
                or POST /v1/inventory/sources/upsert (new)
```

Auth: same service API keys, or a dedicated “importer” key scoped to a service/project.

**Wiz adapter (concrete):**

1. OAuth client credentials against `https://auth.app.wiz.io/oauth/token`
2. GraphQL at `https://api.<dc>.app.wiz.io/graphql`
3. Query API endpoint inventory (paginate; stay under Wiz’s ~3 rps guidance)
4. Map host → Glimpse `Service` (manual mapping table first: `WizAssetBinding`)
5. Map method + path → `pathTemplate`
6. Store Wiz auth scheme / exposure in `metadata`

**Crawl adapter (concrete, owned apps):**

1. Nick provides base URL + session cookie / basic auth / SSO storage state
2. Playwright run: collect unique `(method, URL path)` from network log
3. Optional second pass: Katana with `-H 'Cookie: …'` on same allowlist
4. Normalize + upsert with `kind=crawl`
5. Never store response bodies in Postgres (same product rule as traffic)

---

## Build phases

### DS0 — Design lock (this doc)

- [x] Source tiers and merge model
- [ ] Nick: confirm Wiz is in-scope as first external feed
- [ ] Nick: list 1–3 owned apps for crawl pilot (URLs + auth method)

### DS1 — Provenance in inventory

- Prisma `EndpointSourceEvidence` (+ optional denorm fields)
- Ingest accepts source-tagged upserts without inventing schemas
- Dashboard: filter / badge “Traffic · Wiz · OpenAPI · Crawl”
- OpenAPI export unchanged (still observation-first; optional later: include `x-discovery-sources`)

### DS2 — Wiz importer

- CLI or dashboard “Connect Wiz” (client id/secret in env / secret store — never in git)
- Scheduled sync (e.g. hourly)
- Service binding UI (Wiz host/asset → Glimpse service)
- Diff report: Wiz-only vs traffic-only

### DS3 — Spec + gateway config import

- Upload / URL fetch OpenAPI
- Optional: Kong/AWS export parsers
- Diff: documented vs observed

### DS4 — Authenticated crawl kit

- `connectors/discovery/crawl` — Playwright recipe + allowlist
- Optional Katana sidecar in docs (user runs locally; we ingest JSON)
- HAR upload endpoint for QA dumps

### DS5 — Correlation UX (the product moment)

- Single endpoint detail: evidence timeline per source
- Project view: coverage matrix (sources × services)
- Alerts: `endpoint.source.confirmed`, long-lived Wiz-only zombies

---

## Explicit non-goals

- Rebuilding Wiz ASM / toxic-combination graph inside Glimpse
- Unauthenticated internet-wide scanning
- Storing raw request/response bodies from crawls or Wiz
- Replacing app/gateway traffic connectors — crawls are complementary
- Customer-hosted agent (still non-goal per [PRODUCTIZATION.md](./PRODUCTIZATION.md))

---

## OSS toolbox (operator runbooks, not necessarily bundled)

Use on **allowlisted owned hosts** with credentials Nick provides:

| Job | Tools |
| --- | --- |
| JS/HTML endpoint harvest | Katana, hakrawler, gospider |
| Authenticated SPA harvest | Playwright (preferred for Glimpse adapter) |
| API wordlist probe | Kiterunner, ffuf (careful) |
| Passive session capture | mitmproxy, browser HAR |
| Spec discovery | `swagger-cli`, spectral; curl common OpenAPI paths |
| Diff / merge locally | `jq`, custom scripts → Glimpse import JSON |

Prefer **export JSON → Glimpse import** over shipping every scanner inside the SaaS. Bundle only Playwright + Wiz + OpenAPI first.

---

## Success criteria

1. A service can show endpoints that never appeared in traffic but exist in Wiz or OpenAPI.
2. When traffic later hits that path, evidence flips to “confirmed” without duplicating the row.
3. Dashboard can answer: “What does Wiz know that we haven’t instrumented?”
4. Crawl of one owned SPA adds client-visible API paths within a single authenticated run.
5. No raw bodies or secrets persisted; Wiz credentials only in runtime secrets.

---

## Suggested first implementation order

```text
DS1 provenance schema  →  DS2 Wiz sync  →  DS3 OpenAPI upload  →  DS4 crawl kit  →  DS5 matrix UX
```

Wiz first after schema because you already have the inventory and credentials; crawl second for apps without cloud-gateway footprints; OpenAPI whenever docs exist.

---

## Open questions for Nick

1. Prefer **Wiz → Glimpse** as the first external feed, or **OpenAPI upload** (no Wiz API work)?
2. Service mapping: manual binding UI first, or hostname auto-match?
3. Crawl: run in Glimpse cloud against allowlisted URLs, or **local/CI only** with JSON upload (safer egress story)?
4. Should Wiz-only endpoints count toward `endpointLimit` / billing the same as traffic-discovered ones?
