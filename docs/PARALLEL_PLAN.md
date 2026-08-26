# Parallel work plan — API Glimpse next

**Audience:** Nick reviews → launches parallel agents.  
**Prior plans:** Dashboard SaaS + Railway/Render productization are **DONE** — do not rebuild.  
**In flight (PR #3):** Phase A billing foundation (key revoke, `endpointLimit`, install snippet). Merge/redeploy before Stripe agents touch the same schema.

Plan mode is unavailable in the current Cloud Agent session; this doc is the reviewable plan of record.

---

## How to run in parallel

| Rule | Detail |
| --- | --- |
| One agent per workstream ID (`W1`…`W8`) | Avoid two agents editing the same files |
| Respect **Blocked by** | Don’t start Stripe UI before billing schema/webhooks land |
| Nick-only streams | No agent can complete without your accounts (npm, Resend, Stripe) |
| Cost | No Railway/Render plan upgrades; Stripe is usage-based after you create an account |

Suggested first wave (safe parallel): **W1 + W2 + W3 + W5** (after PR #3 merge).  
Second wave: **W4** (needs Stripe keys + W3).  
Later / optional: **W6, W7, W8**.

---

## Done (do not re-plan)

- [x] Dashboard AuthModal, AppLayout, projects, inventory, endpoint detail, account  
- [x] Marketing auth modal + CORS / `COOKIE_DOMAIN`  
- [x] Dockerfiles; private ingest; public core + agent; Render static sites  
- [x] Custom domains (`apiglimpse.com`, `app`, `docs`, `api`, `collect`)  
- [x] Global ingest `ENDPOINT_LIMIT` stub  
- [x] Phase A in PR #3: revoke keys, `Project.endpointLimit`, install snippet *(merge + migrate)*  

---

## Nick-only (not agent code)

### N1 — Resend (magic-link email)

**Doc:** [LAUNCH_NEXT.md](./LAUNCH_NEXT.md)  
**Steps:** Resend account → verify `apiglimpse.com` DNS → API key → Railway **core** `RESEND_API_KEY` + `RESEND_FROM_EMAIL` → redeploy core → test magic link.  
**Done when:** Magic-link email arrives from production.

### N2 — Publish connectors (npm / PyPI / Go)

**Doc:** [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md) (overview) · [NPM_PUBLISH.md](./NPM_PUBLISH.md) (npm account/org)  
**Steps:** Org `@apiglimpse` + 2FA → publish `shared` then `middleware` + `fastify` → PyPI `apiglimpse` → tag `connectors/go/v0.1.0`.  
**Done when:** `npm view @apiglimpse/middleware version`, `pip install apiglimpse`, and `go get …@v0.1.0` work outside the repo.

### N3 — Stripe account + keys

**Doc:** [STRIPE.md](./STRIPE.md) (Railway core variables + webhook URL + Admin plans).

Create Stripe account; use **Test mode** first; create Pro product/price; set on Railway **core**:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ADMIN_EMAIL` (your app login email — enables `/admin`)
- Plan Stripe Price IDs via **Admin → Plans** (or `STRIPE_PRICE_PRO`)

**Done when:** Keys in Railway (never paste into chat). Webhook points at `https://api.apiglimpse.com/api/billing/webhook`.

### N4 — Soft-launch smoke

After N1–N2 (+ Phase A deploy): register/login → project → key → middleware → inventory; revoke key → traffic rejected.  
**Doc:** [TESTING.md](./TESTING.md) / [LAUNCH_NEXT.md](./LAUNCH_NEXT.md).

---

## Agent workstreams

### W1 — Finish / verify Phase A (billing foundation)

**Goal:** Land and prove PR #3 behavior on prod/local.  
**Depends on:** Merge PR #3; Railway core+ingest redeploy (migrate).  
**Touches:** Mostly verify; small fixes only in:

- `backend/routes/projects.js`
- `ingest/middleware/apiKey.js`
- `ingest/routes/inventory.js`
- `frontend/src/pages/ProjectSettings.jsx`

**Tasks:**

1. Confirm migration applied (`endpointLimit`, `revokedAt` columns).  
2. Manual or scripted test: revoke → ingest 401; set `endpointLimit` on a project → new endpoints skipped.  
3. Add `VITE_COLLECT_URL=https://collect.apiglimpse.com` on Render Dashboard if missing; rebuild.  
4. Mark Phase A success criteria in [NEXT_PHASE.md](./NEXT_PHASE.md).

**Out of scope:** Stripe, OpenAPI, orgs.

---

### W2 — Onboarding polish (post-install UX)

**Goal:** First-run path from empty project → seeing inventory without reading docs.  
**Depends on:** W1 (install snippet exists).  
**Touches:**

- `frontend/src/pages/Projects.jsx`
- `frontend/src/pages/Inventory.jsx`
- `frontend/src/pages/ProjectSettings.jsx` (light)
- Optional: `docs-site/` integrating pages

**Tasks:**

1. Empty inventory state: “Connect middleware” with snippet / link to settings.  
2. After project create: surface key + collect URL + link to docs.  
3. Align marketing/docs CTAs with published package name once N2 is done.

**Out of scope:** Billing UI.

---

### W3 — Stripe backend (Checkout, Portal, webhooks)

**Goal:** Map Stripe subscription → `User`/`Project` billing fields + `endpointLimit`.  
**Depends on:** N3 keys; W1 schema live.  
**Touches:**

- `backend/prisma/schema.prisma` (+ migration): e.g. `stripeCustomerId`, `stripeSubscriptionId`, `plan` on User or Project  
- `backend/routes/billing.js` (new)  
- `backend/server.js` (mount + raw body for webhooks)  
- `backend/.env.example`  
- Plan constants module (`backend/lib/plans.js`): Free vs Pro endpoint caps  

**Tasks:**

1. Lock plan table (proposal):  

   | Plan | Endpoint cap | Price |
   | --- | --- | --- |
   | Free | e.g. 25 | $0 |
   | Pro | e.g. 500 or unlimited | TBD |

2. `POST /api/billing/checkout` → Stripe Checkout Session (auth required).  
3. `POST /api/billing/portal` → Customer Portal.  
4. `POST /api/billing/webhook` — verify signature; on `checkout.session.completed` / `customer.subscription.*` set plan + `endpointLimit` on owned projects (or default project).  
5. `GET /api/billing/me` — current plan, usage (`endpoint` count), portal/checkout availability.  

**Out of scope:** Marketing pricing page (W4). Protect mode.  

**Decision (locked):** **User-level subscription**; `Plan.endpointLimit` applied to **each** owned project on plan change. Documented in `backend/lib/plans.js` and [STRIPE.md](./STRIPE.md).

---

### W4 — Billing UI + marketing pricing

**Goal:** Pay / manage billing in-app; honest pricing on marketing.  
**Depends on:** W3.  
**Touches:**

- `frontend/src/pages/Billing.jsx` (new) + `App.jsx` nav link  
- `frontend/src/api/api.js`  
- `marketing/` pricing section or `/pricing` route  
- Docs: brief billing blurb  

**Tasks:**

1. Account/Billing page: plan name, endpoints used vs cap, Upgrade / Manage buttons.  
2. Soft gate messaging when near/at cap (inventory banner).  
3. Marketing pricing only with real numbers from W3 plan table — no fake tiers.  

**Out of scope:** Invoices PDF, tax, multi-currency.

---

### W5 — OpenAPI export

**Goal:** Export project inventory as OpenAPI 3 JSON/YAML.  
**Depends on:** None (parallel with W2/W3).  
**Touches:**

- `backend/routes/inventory.js` or new `backend/lib/openapi.js`  
- `frontend` endpoint list / project page download button  
- `docs-site` short “Export” note  

**Tasks:**

1. `GET /api/inventory/:projectId/openapi` → OpenAPI 3.0 from endpoints + schemas.  
2. Dashboard “Export OpenAPI” download.  
3. Don’t invent paths not in inventory.

**Out of scope:** Import OpenAPI; sync to gateway.

---

### W6 — Key hygiene (rotate + last-used UX)

**Goal:** Rotate = create + revoke old; clearer key table.  
**Depends on:** W1.  
**Touches:** `backend/routes/projects.js`, `ProjectSettings.jsx`  

**Tasks:**

1. “Rotate” action: create new key, show raw once, optionally revoke previous.  
2. Warn if zero active keys.  

**Out of scope:** Multiple projects’ bulk revoke.

---

### W7 — Orgs / invites (multi-seat)

**Superseded by full epic:** [SAAS_PLAN.md](./SAAS_PLAN.md) (streams **S0–S6**: account hub, usage/license, Org→Project→Service hierarchy, RBAC, invites, org billing).

**Goal:** Share services with teammates under an organization.  
**Depends on:** Prefer after W3 (billing owner clear); Resend (N1) for invites.  
**Do not** implement from this stub — use **SAAS_PLAN.md** as the plan of record.  

**Heavy** — own epic; don’t parallel schema work with W3 on the same Prisma files without coordination.

---

### W8 — Protect mode (deferred epic)

**Doc:** [PROTECT_MODE.md](./PROTECT_MODE.md)  
**Depends on:** Stable discovery + billing.  
**Not for soft-launch.** Observe-only remains default.

---

## Next wave (sales / posture)

After soft-launch streams above, use **[SALES_FEATURES_PLAN.md](./SALES_FEATURES_PLAN.md)** (`SF0`–`SF8`) for risk posture, drift alerts, topology, evidence packs, gateway connectors, and sales packaging. Do not extend this file with those streams — keep one plan of record.

---

## Explicit non-goals (all streams)

- Password reset (unless Nick reopens)  
- Customer-hosted agent SKU  
- Railway/Render paid tier upgrades without asking  
- Fake pricing before Stripe  
- Per-customer agent containers  

---

## Suggested agent prompts (copy-paste)

**W2:**  
> Implement onboarding polish per `docs/PARALLEL_PLAN.md` workstream W2 only. Do not touch billing/Stripe. Empty inventory + post-create project UX pointing at install snippet and collect URL.

**W3:**  
> Implement Stripe backend per `docs/PARALLEL_PLAN.md` W3. Read `docs/NEXT_PHASE.md`. Use existing `Project.endpointLimit`. Add migration for Stripe IDs. Do not build marketing pricing. Wait for env vars in `.env.example` only — do not invent live secrets.

**W5:**  
> Implement OpenAPI export per `docs/PARALLEL_PLAN.md` W5 only. Own inventory/OpenAPI files; don’t modify ProjectSettings billing or Stripe routes.

**W4 (after W3 merges):**  
> Implement billing UI + marketing pricing per W4, matching plan constants from `backend/lib/plans.js`.

---

## Dependency graph

```text
N1 Resend ──────────────┐
N2 npm ─────────────────┼─► N4 smoke
PR#3 / W1 Phase A ──────┘
         │
         ├─► W2 onboarding
         ├─► W5 OpenAPI
         ├─► W6 key rotate
         │
N3 Stripe keys ─► W3 Stripe backend ─► W4 Billing UI + pricing
                         │
                         └─► W7 orgs (later)
W8 protect (later)
```

---

## Review checklist for Nick

Before launching agents, confirm:

1. [ ] Merge PR #3 and redeploy core + ingest  
2. [ ] Free vs Pro endpoint caps (numbers)  
3. [ ] Billing unit: **user** vs **project** subscription  
4. [ ] Pro price (USD/mo) for marketing  
5. [ ] Which streams to run first wave: recommended **W2 + W5 + W3** (W3 only if N3 ready)  
