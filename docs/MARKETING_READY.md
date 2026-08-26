# Marketing-ready product plan

**Audience:** Nick reviews → locks decisions → launches parallel agents.  
**Status:** Plan of record (2026-08-26).  
**Question this answers:** What *dev / product* work is still needed before API Glimpse is **almost ready for marketing** (credible soft-launch that can support modest acquisition)?

**Separate from:**

| Doc | Role |
| --- | --- |
| [MARKETING_PLAN.md](./MARKETING_PLAN.md) | GTM, ads, messaging, streams **M0–M8** |
| [PROTECT_MODE.md](./PROTECT_MODE.md) | Future security / blocking epic (**not** required for marketing-ready) |
| [PARALLEL_PLAN.md](./PARALLEL_PLAN.md) | Older W1–W8 — much of it is already in repo; don’t rebuild |
| [LAUNCH_NEXT.md](./LAUNCH_NEXT.md) | Nick click-ops (Resend, publish, smoke) |

Plan mode is unavailable in this Cloud Agent session; this file is the reviewable plan of record.

---

## Definition: “almost ready for marketing”

A stranger can:

1. **Sign up / magic-link login** and receive email (Resend live).
2. **Create a service + API key** and see a truthful install path for a stack we advertise.
3. **`npm` / `pip` / `go get` from public registries** matching docs (or docs clearly say “publish pending” — never 404 on advertised installs).
4. Hit a few routes → **inventory appears** within seconds.
5. Open **marketing + docs** and see **connector lists that match reality**.
6. See **pricing that doesn’t imply a broken Checkout** (either Stripe Price IDs live, or UI soft-gates paid CTAs when `hasStripePrice` is false).
7. (For paid ads) **Analytics + at least one campaign LP** exist — tracked in [MARKETING_PLAN.md](./MARKETING_PLAN.md) **M1/M3**, not duplicated here.

Protect / blocking is **explicitly out of this bar**. North-star security platform is planned; claims stay discovery-first until [PROTECT_MODE.md](./PROTECT_MODE.md) ships.

---

## Audit snapshot (2026-08-26)

### Already in good shape (don’t rebuild)

- Live hosts: `apiglimpse.com`, `app`, `docs`, `api`, `collect`
- Auth, dashboard, inventory, endpoint detail, OpenAPI export
- Key create / revoke / rotate + install snippet + empty-state onboarding
- Billing scaffold: plans catalog, `/billing`, checkout/portal/webhook code paths
- Orgs / invites / RBAC largely in repo (solo path is enough for first marketing)
- Connectors **in repo**: Express, Fastify, FastAPI, Go (chi)

### What still blocks “almost ready”

| Kind | Gap |
| --- | --- |
| **Nick ops** | Resend; publish connectors to npm/PyPI/Go; Stripe Price IDs if advertising Pro Checkout; E2E smoke; migrate org plan snapshots if not deployed |
| **Dev (truth)** | ~~Marketing Express-only~~ → sync to code connectors (R1) |
| **Dev (activation)** | ~~Express-only install snippet~~ → multi-stack (R2) |
| **Dev (monetization honesty)** | Soft-gate paid CTAs when `hasStripePrice` is false (R3); explain catalog vs org snapshots |
| **Dev (docs polish)** | Architecture + Service glossary + publish note (R4) |
| **GTM (separate)** | Analytics, LPs, creatives — [MARKETING_PLAN.md](./MARKETING_PLAN.md) |

**Billing semantics (code):** Plan rows are a **catalog**. Assign/signup snapshots limits onto **Organization**; template edits do not cascade. Teams = Organizations. Truth: [ORG_PLAN_LIMITS.md](./ORG_PLAN_LIMITS.md).

---

## How to run in parallel

| Rule | Detail |
| --- | --- |
| One agent per stream ID (`R1`…`R6`) | Avoid two agents editing the same files |
| Nick-only (`N-R*`) | Resend, registry publish, Stripe keys, smoke |
| Do **not** implement protect here | Use [PROTECT_MODE.md](./PROTECT_MODE.md) later |
| Do **not** duplicate GTM ads/LP work | Point agents at **M\*** in MARKETING_PLAN for those |
| Cost | No Railway/Render upgrades; no inventing Stripe secrets |

Suggested first wave: **R1 ∥ R3 ∥ R4** + Nick starts **N-R1 / N-R2**.  
Second wave: **R2** (after publish plan clear), **R5**.  
GTM wave (parallel once truth lands): **M1 ∥ M2** then **M3**.

---

## Nick-only (not agent code)

### N-R1 — Resend

**Doc:** [LAUNCH_NEXT.md](./LAUNCH_NEXT.md)  
**Done when:** Magic-link (and invite) email arrives from `apiglimpse.com`.

### N-R2 — Publish connectors

**Doc:** [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md) · [NPM_PUBLISH.md](./NPM_PUBLISH.md)  
Publish `@apiglimpse/shared` → `middleware` → `fastify`; PyPI `apiglimpse`; Go module tag.  
**Done when:** Fresh machine can install every stack docs mark “Available.”

### N-R3 — Stripe live (only if marketing Pro $)

**Doc:** [STRIPE.md](./STRIPE.md)  
Set Price IDs so Admin plans have `hasStripePrice: true` for Pro.  
**Done when:** Test-mode Checkout completes and webhook sets plan/limits.

### N-R4 — E2E smoke

Register → service → key → published connector → inventory; bad key → reject.  
**Doc:** [TESTING.md](./TESTING.md)

---

## Agent workstreams

### R1 — Public surface truth (marketing + docs-site)

**Goal:** Never advertise a connector or install command that isn’t real.  
**Depends on:** Clarify with Nick whether **N-R2 is done or imminent**.  
**Touches:**

- `marketing/src/pages/Home.jsx`
- `marketing/src/pages/HowItWorks.jsx`
- `marketing/src/pages/GetStarted.jsx`
- `docs-site/docs/introduction.md`
- `docs-site/docs/integrating.md`
- `docs-site/docs/index.md` (if needed)

**Tasks:**

1. If packages **are published:** set marketing Available = Express, Fastify, FastAPI, Go (chi); remove those from “Coming soon.”  
2. **Code is source of truth for availability** — list connectors that exist in-repo as Available even before registry publish, and keep the publish caveat on docs (match `docs/INTEGRATING.md`).  
3. Nest / Next / Hono / proxy stay “Coming soon.”  
4. Soft-launch honesty: no protect / blocking language.
5. Pricing copy: catalog limits apply to **new** assignments; orgs keep snapshotted limits ([ORG_PLAN_LIMITS.md](./ORG_PLAN_LIMITS.md)).

**Out of scope:** Analytics scripts (M1); campaign LPs (M3); Prisma.

**Done when:** Marketing ↔ docs-site ↔ registries tell the same story.

---

### R2 — Multi-stack install affordance (dashboard)

**Goal:** First-run install matches the stacks we sell.  
**Depends on:** R1 decision; ideally N-R2.  
**Touches:**

- `frontend/src/pages/ProjectSettings.jsx` (or service settings)
- Optional: empty inventory CTA copy in `Inventory.jsx` / `Projects.jsx`
- Light link-out to `docs.apiglimpse.com` per stack

**Tasks:**

1. Install panel: tab or select for Express / Fastify / FastAPI / Go with correct package + snippet.  
2. `API_SENSOR_AGENT_URL` / key placeholders use `https://collect.apiglimpse.com`.  
3. Don’t invent Nest/Next snippets.

**Out of scope:** New connectors; protect options in snippet.

**Done when:** A FastAPI or Go user can copy a working snippet without leaving the app for the basic path.

---

### R3 — Pricing & Checkout honesty

**Goal:** Never show a hard “Upgrade / Buy Pro” path that 503s because Stripe isn’t wired.  
**Depends on:** None (safe now).  
**Touches:**

- `marketing/src/pages/Pricing.jsx`
- `frontend/src/pages/Billing.jsx` (and any Upgrade buttons)
- Optional: small copy helper when `hasStripePrice === false`

**Tasks:**

1. If plan has display price but `!hasStripePrice`: show price as informational **or** “Checkout enabling soon”; primary CTA = Sign up / Contact sales — not a broken Checkout.  
2. When `hasStripePrice` true: keep Upgrade → Checkout.  
3. Do not invent dollar amounts client-side; keep catalog as source of truth.  
4. Align soft-launch disclaimer with Admin catalog reality (Free 25 / Pro caps as returned by API).

**Out of scope:** Changing plan rows in DB; Stripe account setup (N-R3).

**Done when:** A visitor cannot click into a dead paid checkout from marketing or billing.

---

### R4 — Docs consistency polish

**Goal:** Architecture and naming don’t contradict integrating guides.  
**Depends on:** None.  
**Touches:**

- `docs-site/docs/architecture.md`
- Spot-check `docs/INTEGRATING.md` vs docs-site integrating
- Customer-facing “project” vs “service” where it confuses install

**Tasks:**

1. Fix Express-only architecture blurb → multi-connector.  
2. One short glossary line: **Service** = one API you install a connector on (keys + inventory).  
3. No protect claims.

**Out of scope:** Full docs rewrite; VitePress theme work.

---

### R5 — Activation path hardening (product)

**Goal:** Empty → first endpoint path is obvious and resilient.  
**Depends on:** R2 helpful; N-R1 for email.  
**Touches:**

- `frontend` empty states / post-create banners (verify still correct after org/service IA)
- Optional: backend event hooks stub for future lifecycle mail (coordinate with M8)

**Tasks:**

1. Walk soft-launch checklist as code review: missing key warning, empty inventory CTA, revoke behavior docs.  
2. Fix any broken deep links from marketing auth → app services list.  
3. Add a short **internal** smoke markdown checklist update in [TESTING.md](./TESTING.md) for four connectors (even if Nick runs it).

**Out of scope:** Full lifecycle email product (M8); protect.

---

### R6 — Attribution hooks (light, optional)

**Goal:** Persist UTMs through signup for later Admin insight.  
**Depends on:** Prefer after M1 vendor choice.  
**Touches:**

- `marketing` AuthModal / register payload
- `backend` auth register (optional `utm` JSON on User or event log)
- Admin user detail read-only display (optional)

**Tasks:**

1. Capture `utm_*` on first marketing landing (sessionStorage).  
2. Send on register if backend accepts; otherwise document cookie handoff.  
3. No PII beyond what auth already stores.

**Out of scope:** Full warehouse; ad platform offline conversions API.

---

## Future epic (not in this plan): protect → security platform

When discovery marketing is working, open [PROTECT_MODE.md](./PROTECT_MODE.md) streams **PM0–PM4**:

```text
PM0 contracts → PM1 shadow → PM2 opt-in block → PM3 policy UX → PM4 edge playbook
```

GTM claim unlocks are listed in [MARKETING_PLAN.md](./MARKETING_PLAN.md#north-star-api-security-platform). **Do not** start PM\* agents under the marketing-ready banner.

---

## Dependency graph

```text
N-R1 Resend ──────────────┐
N-R2 Publish connectors ──┼─► N-R4 smoke ─► “almost ready” gate
R1 surface truth ─────────┘
R3 pricing honesty (∥)
R4 docs polish (∥)
         │
         ▼
R2 multi-stack install ──► R5 activation hardening
         │
N-R3 Stripe (if selling Pro $) ─► R3 already soft-gates until then
         │
         ▼
Hand off to MARKETING_PLAN M1/M2/M3 for ads readiness
```

---

## Suggested agent prompts (copy-paste)

**R1:**  
> Execute `docs/MARKETING_READY.md` stream **R1** only. Make marketing + docs-site connector/install claims match registry reality. If packages are unpublished, prefer one honest story (don’t leave docs saying npm install works when it 404s). No protect language. No Prisma.

**R2:**  
> Execute **R2** only: multi-stack install snippets in the dashboard (Express, Fastify, FastAPI, Go) per MARKETING_READY. Link to docs for detail. Don’t add Nest/Next. Don’t touch billing schema.

**R3:**  
> Execute **R3** only: soft-gate paid Checkout/Upgrade when `hasStripePrice` is false on marketing Pricing and app Billing. Keep catalog as price source of truth.

**R4:**  
> Execute **R4** only: docs-site architecture + glossary consistency for multi-connector and Service naming. No theme redesign.

**R5:**  
> Execute **R5** only: verify/fix activation empty states and update TESTING.md smoke for four connectors. No lifecycle email product.

---

## Success criteria (marketing-ready gate)

- [ ] N-R1 magic link works in production  
- [ ] N-R2 all “Available” connectors install from public registries  
- [ ] R1 marketing ↔ docs ↔ registries consistent  
- [ ] R3 no dead paid checkout from public CTAs  
- [ ] N-R4 E2E smoke green on at least Express + one other stack  
- [ ] R2 install UI covers advertised stacks (or docs-only interim explicitly accepted by Nick)  
- [ ] GTM **M1** analytics env ready before any paid spend (separate plan)

---

## Explicit non-goals

- Protect / blocking implementation  
- Advertising “API security platform” as current state  
- Nest / Next / Hono / proxy connectors  
- Password reset  
- Org billing migration (S5) as a soft-launch blocker  
- Content mill / competitor attack pages  
- Re-implementing OpenAPI, key rotate, or onboarding from PARALLEL_PLAN (already shipped)

---

## Review checklist for Nick

1. [ ] Confirm definition of “almost ready” above  
2. [ ] Choose R1 strategy: publish first (**N-R2**) vs soften docs until publish  
3. [ ] Lock whether Pro $ is advertised before Stripe Price IDs (**N-R3** vs R3 soft-gate only)  
4. [ ] Launch first wave: **R1 + R3 + R4**  
5. [ ] After gate: run [MARKETING_PLAN.md](./MARKETING_PLAN.md) **M1 + M2 + M3** before ads  
6. [ ] Protect epic stays parked until discovery acquisition works  
