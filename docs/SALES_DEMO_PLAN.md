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
Internet / traffic script
        │
        ▼
┌───────────────────┐     private net      ┌───────────────────┐
│ edge-bff (Express)│ ───────────────────► │ users (FastAPI)   │
│ PUBLIC            │ ───────────────────► │ PRIVATE           │
└─────────┬─────────┘ ───────────────────► │ orders (Go chi)   │
          │                                │ PRIVATE           │
          │                                └─────────┬─────────┘
          │                                          │
          │         X-Service-Name on each hop       │
          ▼                                          ▼
     ┌────────────────────────────────────────────────────┐
     │  API Glimpse agent (shared) → ingest → dashboard   │
     └────────────────────────────────────────────────────┘
```

---

## Recommended “Acme Retail” topology (MVP)

Keep it to **3–4 apps**, not every connector we have. Breadth sells in docs; depth sells on a call.

| Role | Language / connector | Exposure | Why it’s on the call |
| --- | --- | --- | --- |
| **edge-bff** | Express (`@apiglimpse/middleware`) | **Public** HTTPS | Internet-facing; fans out to internals; shows gateway-ish BFF pattern |
| **users-api** | FastAPI (Python) | **Private** only | PII-heavy (email, phone, SSN-shaped fields) |
| **orders-api** | Go chi | **Private** only | Payment-ish payloads (card last4 / PAN-shaped for signal demo) |
| **payments-api** (optional stretch) | Nest or Spring | Private | Secrets / tokens; auth mix |

Optional fifth (second call, not day-one): **Nginx/Kong** in front of `edge-bff` to pitch “discover without instrumenting every app” (SF5) — only if the call audience is platform/infra.

### Service naming (required for topology)

Every service sets:

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com   # or local :8080
API_SENSOR_KEY=ask_...                                 # one project; one key per Service row
API_SENSOR_SERVICE_NAME=edge-bff                       # unique, stable
```

On outbound HTTP between services, also send:

```http
X-Service-Name: edge-bff
```

Dashboard proof: Inventory → **Callers (topology)** shows `edge-bff → users-api` / `orders-api` edges, not anonymous `ua:curl`.

### Public vs private on Railway

| Service | Public domain? | How callers reach it |
| --- | --- | --- |
| `edge-bff` | Yes | Sales script / curl / browser |
| `users-api`, `orders-api` | **No** | `http://users-api.railway.internal:<port>` from edge only |
| Shared agent / core / ingest | Existing prod (do not redeploy per demo) | Demo apps point at prod collect URL |

Local Compose mirrors this with an internal Docker network + only `edge-bff` published on a host port.

---

## Payloads that actually exercise classification

Hello-world `/health` is not enough. Each service needs a small, intentional **data diet**:

| Endpoint | Direction | Fields to include | Demo beat |
| --- | --- | --- | --- |
| `POST /api/auth/login` (edge) | req + res | email, password → JWT-shaped token | secrets + auth observed |
| `POST /api/users` (users) | req | email, phone, ssn | PII / SSN signals |
| `GET /api/users/:id` (users) | res | email, phone | response-side classification (SF0) |
| `POST /api/orders` (orders) | req | cardNumber or pan-shaped string, amount | card signal |
| `GET /api/orders/:id` (orders) | res | last4, email | mixed severity |
| `POST /api/checkout` (edge → both) | orchestration | aggregates user + order | topology + multi-service blast radius |

Rules:

1. Use **synthetic** but pattern-matching values (`4111…`, `000-00-0000`, `alice@example.com`) so classifiers fire without real PII.
2. Keep bodies **JSON and small** — connectors skip streams/binary by design.
3. Mix **auth**: some routes with `Authorization: Bearer …`, some with none → “No auth observed” filter.
4. Include one **undocumented** internal route (`POST /internal/debug/export`) hit only by the traffic script → shadow-API story.

Reuse shapes already in `demo/*/server` apps; extend them so **edge calls users/orders** instead of each app being an island.

---

## Traffic script (required)

Ship a single runner under e.g. `demo/acme/traffic.sh` (or small Node `traffic.mjs`) that:

1. Hits **only** the public edge base URL (never internals from the laptop — proves private net).
2. Runs a **fixed scenario** so every call looks the same (rehearsable):
   - login → create user → create order → checkout → list users → hit unauth sensitive route → hit shadow `/internal/...`
3. Sets realistic headers: `Authorization`, `User-Agent`, and when simulating another service, `X-Service-Name`.
4. Supports `--once` (sales call) and `--loop 30s` (keep inventory “alive” during a longer demo).
5. Prints a one-line checklist of what the AE should click next in the dashboard.

Do **not** load-test. This is narrative traffic, not k6.

Example flow:

```text
traffic --once
  POST /api/auth/login
  POST /api/checkout   → edge fans out to users + orders (internal)
  GET  /api/users/1      (via edge proxy or public aggregate)
  GET  /api/orders/1
  POST /internal/debug/export   (no auth, sensitive body)
→ “Open project Acme Demo → filter Has sensitive signals → open topology”
```

---

## Dashboard project setup (one-time)

1. Org/project: **Acme Demo** (or per-AE clone if keys must be isolated).
2. Create **three Services** (edge-bff, users-api, orders-api) → three `ask_` keys.
3. Bookmark / note deep links: inventory (signals filter), posture if SF1 live, topology, evidence download, OpenAPI export.
4. Optional: seed empty → run traffic once before the call so the map isn’t blank at minute zero; use `--loop` only if you want live hit counters ticking.

Reset story: wipe/recreate project **or** document “new endpoints appear when we hit `/internal/...` mid-call” for drift (SF2).

---

## Call narrative (~10–12 minutes)

| Min | Show | Say |
| --- | --- | --- |
| 0–1 | Architecture sketch (this doc’s diagram) | “Three real services, two languages behind a public BFF; only the edge is internet-facing.” |
| 1–2 | Run `traffic --once` | “We’re generating the same traffic your apps already produce.” |
| 2–5 | Inventory by service | “Docs vs reality — these paths were hit, with counts.” |
| 5–7 | Sensitive signals / posture | “Classification from shapes, not stored bodies — email, card, SSN-class fields.” |
| 7–9 | Topology | “edge-bff is the caller into users and orders — blast radius if edge is abused.” |
| 9–10 | Auth filter + shadow route | “Unauth + sensitive; this internal export never made the OpenAPI.” |
| 10–12 | Evidence / OpenAPI export | “What you’d attach for audit / M&A / onboarding a WAF.” |

Leave protect / tickets for enterprise follow-ups unless the prospect asks (SF6–SF7).

---

## Implementation shape (when building)

### Repo layout (proposal)

```text
demo/acme/
  docker-compose.yml      # edge public; users/orders internal network
  traffic.mjs             # scenario runner
  README.md               # AE runbook + Railway notes
  edge-bff/               # thin Express BFF (or wrap demo/express-app)
  users-api/              # thin FastAPI (or wrap demo/fastapi-app)
  orders-api/             # thin Go chi (or wrap demo/go-chi-app)
```

Prefer **thin wrappers** around existing `demo/*` apps rather than forking connectors. Add inter-service HTTP + richer payloads only where needed.

### Compose (local)

- One bridge network `acme-internal`.
- Publish only `edge-bff:4000`.
- Env files with three keys + `USERS_URL=http://users-api:4002`, `ORDERS_URL=http://orders-api:4003`.
- Optionally include local agent/postgres via root compose **or** point demos at production collect (simpler for AE laptops).

### Railway

- One Railway project **api-glimpse-acme-demo** (separate from product prod).
- Three services from the same repo / Dockerfiles; private networking on; public domain **only** on edge.
- Variables reference sibling private hostnames.
- Cost: keep replicas at 1; sleep/idle if Railway plan allows — Nick gate on spend ([SALES_FEATURES_PLAN](./SALES_FEATURES_PLAN.md) cost rule).

**Compose ≠ Railway:** do not expect `docker-compose up` to deploy to Railway as one unit. Either (a) define three Railway services manually / via config-as-code, or (b) keep Compose local-only and document the Railway service map in `demo/acme/README.md`.

---

## What you’re missing (gaps vs the original idea)

1. **Inter-service calls** — without them, topology is empty or UA-only noise; multi-language islands don’t prove “how they interact.”
2. **Stable service names** — `API_SENSOR_SERVICE_NAME` + `X-Service-Name` on every hop.
3. **One project, multiple Services/keys** — matches the real tenancy story; one key for everything muddies the inventory.
4. **Public/private split that the script respects** — traffic must enter only at the edge so the “internal network only” claim is credible.
5. **Classification-oriented payloads** — hello-world won’t light up filters; bake in email/phone/ssn/card/token deliberately.
6. **Auth mix + one shadow route** — otherwise “auth coverage” and “docs vs reality” are weak.
7. **Rehearsable traffic script + AE runbook** — not just deploy; the call needs a fixed sequence and click path.
8. **Don’t redeploy product agent per demo** — point connectors at the existing multi-tenant collector.
9. **Reset / mid-call reveal** — plan how inventory starts (pre-warmed vs blank) and what you discover live (new endpoint / new signal).
10. **Honest limits on the call** — we sample **shapes**, redact secrets, skip streams; say it once so security buyers don’t stall on “do you store bodies?”
11. **Gateway as optional act two** — Nginx/Kong is a different buyer objection (“we can’t put SDK in every app”); keep it out of the default 3-service pack.
12. **Ops hygiene** — synthetic data only; rotate demo API keys if the project is shared; no production customer keys in the AE laptop env.

---

## Non-goals

- Full mesh / service graph for every connector in `demo/`.
- Real payment processing, real IdP, or real PII.
- Per-language agents or per-customer collectors.
- Load / chaos testing as the sales motion.
- Claiming eBPF or full APM parity (SF3 is explicitly lightweight).

---

## Build order (when Nick greenlights)

| Step | Deliverable | Done when |
| --- | --- | --- |
| D0 | This plan locked | Topology + languages + public/private agreed |
| D1 | `demo/acme` apps + compose + env examples | `docker compose up` + traffic fills three inventories |
| D2 | Traffic script + README runbook | AE can run `--once` without engineering |
| D3 | Railway three-service deploy | Public edge only; internals reachable via private DNS |
| D4 | Sales one-pager (call script above) | Linked from `docs/ads/` or AE Notion |

D1–D2 can be one agent stream; D3 is Nick/ops (Railway project + domains).

---

## Review checklist

- [ ] Lock MVP languages: Express + FastAPI + Go (yes/no Nest instead of Go)
- [ ] Point demos at **prod** collect vs dedicated demo agent (recommend prod collect + dedicated Acme project)
- [ ] Pre-warm inventory before calls vs blank-slate discovery mid-call
- [ ] Include Nginx act-two pack? (default: no)
- [ ] Railway spend / always-on vs start-before-call

---
