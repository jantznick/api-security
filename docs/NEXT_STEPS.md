# Nick’s next steps — single checklist

**Audience:** You (Nick).  
**Updated:** 2026-08-26 (after PRs #28–#29 on `main`).  
**Purpose:** One ordered list of everything *you* still need to do for soft-launch credibility and first marketing. Detail docs are linked; this file is the run order.

---

## Already done (don’t redo)

| Area | Status |
| --- | --- |
| Hosts | `apiglimpse.com`, `app.`, `docs.`, `api.`, `collect.` live |
| Product | Auth, orgs/teams, inventory, OpenAPI export, keys rotate/revoke, multi-stack install UI |
| Billing code | Catalog plans, Checkout/Portal/webhook scaffold, Admin plans, contact-sales leads |
| Plan snapshots | Org gets frozen `endpointLimit` / `seatLimit` on assign — catalog edits don’t rewrite existing teams ([ORG_PLAN_LIMITS.md](./ORG_PLAN_LIMITS.md)) |
| Marketing / GTM docs | [MARKETING_PLAN.md](./MARKETING_PLAN.md), [MARKETING_READY.md](./MARKETING_READY.md), site connector truth, SEO basics |
| Protect | Roadmap only — **do not** advertise blocking yet ([PROTECT_MODE.md](./PROTECT_MODE.md)) |

---

## How to use this list

1. Work **Phase A → B → C** in order (A is required for real users).  
2. Check boxes as you go.  
3. Do **not** paste secrets into chat or commit them.  
4. Deeper runbooks stay in the linked docs.

```text
Phase A  Soft-launch credibility   (Resend → publish → Admin → smoke)
Phase B  Monetization              (Stripe test → Pro Checkout → optional live)
Phase C  Marketing accounts        (analytics → LinkedIn/Google → then spend)
Phase D  Optional polish           (announce, partners, agent follow-ons)
```

---

## Phase A — Soft-launch credibility (do first)

Without this, strangers can’t reliably sign up or install.

### A1. Resend (magic-link + invite email)

**Why:** Magic link “succeeds” in the API but **no email** is sent until Resend is configured.

1. [ ] Create/sign in at [resend.com](https://resend.com)
2. [ ] Add + verify domain **`apiglimpse.com`** (SPF / DKIM / etc. as Resend shows)
3. [ ] Create an API key
4. [ ] Railway → **api-glimpse** → **core** → Variables:
   - [ ] `RESEND_API_KEY`
   - [ ] `RESEND_FROM_EMAIL` = `API Glimpse <noreply@apiglimpse.com>` (or verified sender)
5. [ ] Redeploy **core** if it doesn’t auto-restart
6. [ ] Test: `https://apiglimpse.com/?auth=login` → magic link → inbox (+ spam)

Detail: [LAUNCH_NEXT.md](./LAUNCH_NEXT.md) §1.

---

### A2. Admin access on Railway

**Why:** You edit plans, assign plans, and see sales leads in `/admin`.

1. [ ] Railway → **core** → `ADMIN_EMAIL` = your exact login email (e.g. `thenickjantz@gmail.com`)
2. [ ] Redeploy / sign out and in at `https://app.apiglimpse.com`
3. [ ] Confirm **Admin** appears in nav → `https://app.apiglimpse.com/admin`

Detail: [STRIPE.md](./STRIPE.md) §1.

---

### A3. Confirm plan-snapshot migration on prod

**Why:** PR #29 added org snapshot columns; Railway should migrate on boot, but verify once.

1. [ ] After latest **core** + **ingest** deploy, open Admin or create a fresh test account
2. [ ] Confirm a new personal org has plan limits (Free defaults: 25 endpoints, 3 seats unless you changed the catalog)
3. [ ] Optional: change Free catalog limit in Admin → confirm **existing** org caps do **not** change; only new assigns do

Detail: [ORG_PLAN_LIMITS.md](./ORG_PLAN_LIMITS.md).

---

### A4. Publish connectors (npm / PyPI / Go)

**Why:** Marketing + docs list Express / Fastify / FastAPI / Go as available; registries still 404 until you publish.

| Registry | Account to create/claim |
| --- | --- |
| **npm** | Org **`apiglimpse`** + 2FA |
| **PyPI** | Account + 2FA / API token |
| **Go** | Push tags on this GitHub repo |

**npm (order matters):**

1. [ ] `npm login` / org `apiglimpse`
2. [ ] Publish `@apiglimpse/shared` → then `middleware` → then `fastify`  
   (use each package’s `npm run publish:npm` where provided)
3. [ ] Confirm: `npm view @apiglimpse/middleware version` (and shared / fastify)

**PyPI:**

4. [ ] Publish `apiglimpse` from `connectors/python`  
5. [ ] Confirm: `pip install apiglimpse` on a clean machine

**Go:**

6. [ ] Tag + push module version (e.g. `connectors/go/v0.1.0`) per [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md)
7. [ ] Confirm: `go get github.com/jantznick/api-security/connectors/go/apiglimpse@v0.1.0`

Full runbook: [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md) · npm deep dive: [NPM_PUBLISH.md](./NPM_PUBLISH.md).

---

### A5. End-to-end smoke

1. [ ] Register or magic-link on marketing → land in app
2. [ ] Create project/service → copy `ask_…` key
3. [ ] Install **published** Express connector (or Fastify / FastAPI / Go) with:
   - `API_SENSOR_AGENT_URL=https://collect.apiglimpse.com`
   - `API_SENSOR_KEY=ask_…`
4. [ ] Hit a few routes → inventory appears within seconds
5. [ ] `POST https://collect.apiglimpse.com/v1/samples` with **no** key → not 2xx
6. [ ] Optional: revoke key → further samples rejected

Detail: [TESTING.md](./TESTING.md) · [LAUNCH_NEXT.md](./LAUNCH_NEXT.md) §3.

**Phase A gate:** A stranger can sign up (email works), install from a public registry, and see inventory.

---

## Phase B — Stripe & pricing (before advertising Pro $)

Checkout UI exists but stays soft-gated until Price IDs are wired (`hasStripePrice`).

### B1. Stripe account (start in Test mode)

1. [ ] Create [Stripe](https://dashboard.stripe.com) account
2. [ ] Stay in **Test mode** until smoke is green
3. [ ] Products → create **Pro** → recurring monthly Price → copy `price_…`
4. [ ] Developers → Webhooks → Add endpoint:
   - URL: `https://api.apiglimpse.com/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
5. [ ] Copy webhook **Signing secret** (`whsec_…`)

### B2. Railway core Stripe env

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` (then later `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `STRIPE_PRICE_PRO` | Optional fallback if Admin field empty |

1. [ ] Set the variables on **core**
2. [ ] Redeploy **core**

### B3. Lock catalog numbers in Admin

Remember: these limits apply to **new assignments / signups**. Existing orgs keep their snapshots.

1. [ ] Open `/admin` → Plan configuration
2. [ ] Lock Free: endpoint cap, seat cap, $0
3. [ ] Lock Pro: endpoint cap, seat cap, monthly cents, paste **`stripePriceId`**
4. [ ] Enterprise (optional): Contact sales checked; optional contact URL
5. [ ] Save plans
6. [ ] Confirm marketing `/pricing` shows catalog prices and Pro is Checkout-ready when `hasStripePrice` is true

### B4. Stripe smoke (test mode)

1. [ ] Sign in as a test user → `/billing` → Upgrade / Choose Pro
2. [ ] Complete Checkout with Stripe test card
3. [ ] Confirm webhook applied plan → org snapshot + service endpoint caps updated
4. [ ] Manage billing → Customer Portal opens
5. [ ] Cancel / change in portal → webhook updates plan as expected

### B5. Go live (only when ready to charge)

1. [ ] Repeat B1–B4 in **Live mode** with `sk_live_…` / live Price ID / live webhook
2. [ ] Update Admin Pro `stripePriceId` to the live price
3. [ ] Do one real $0.00 or small live smoke carefully

Detail: [STRIPE.md](./STRIPE.md).

**Phase B gate:** Test Checkout works end-to-end; marketing Pro CTA is honest.

---

## Phase C — Marketing accounts & measurement (before paid ads)

Do **not** spend on LinkedIn/Google until Phase A is green and analytics + (ideally) a campaign LP exist.

### C1. Decisions to lock (write them down)

| ID | Decision | Your choice |
| --- | --- | --- |
| K1 | Free/Pro caps + Pro $ for **new** signups | _fill in_ |
| K2 | Who pays for ads + monthly cap ($) | _fill in_ |
| K3 | Analytics: **Plausible** or **PostHog** (recommended for privacy story) | _fill in_ |
| K4 | LinkedIn company page / handles for API Glimpse | _fill in_ |
| K5 | 3–5 design-partner targets for quotes (optional early) | _fill in_ |
| K6 | Public announce timing (HN / LinkedIn) — after A4+A5 | _fill in_ |
| K7 | Where Enterprise leads go (Admin inbox is default; email/Cal optional) | _fill in_ |

Messaging reminder: public category stays **traffic-based API inventory** until protect ships. Do not advertise blocking. ([MARKETING_PLAN.md](./MARKETING_PLAN.md))

---

### C2. Analytics account

1. [ ] Create Plausible **or** PostHog project for `apiglimpse.com`
2. [ ] Note site ID / project key
3. [ ] Plan Render **Marketing** build env (exact names depend on agent M1 implementation), e.g. `VITE_ANALYTICS_*`
4. [ ] After M1 lands: rebuild marketing; confirm pageviews + CTA events
5. [ ] Update Privacy page if analytics is on

Until M1 is implemented, creating the vendor account is enough to unblock later wiring.

---

### C3. LinkedIn

1. [ ] Create/claim **API Glimpse** Company Page
2. [ ] LinkedIn Campaign Manager (ads) account under your billing
3. [ ] Set a hard monthly / daily cap (start tiny)
4. [ ] Optional organic: 2–3 posts after connectors are published (privacy posture, “stale OpenAPI”, connector launch)

Ads creatives/LPs: agents produce packages under `docs/ads/` (M4/M5) — you paste into Campaign Manager after approval.

---

### C4. Google Ads

1. [ ] Create Google Ads account (same billing owner as K2)
2. [ ] Set account-level monthly budget cap
3. [ ] Prefer **Search** first (Brand / API inventory / shadow API) — not Performance Max as first experiment
4. [ ] Conversion action later: signup (and contact sales) once analytics/pixels exist
5. [ ] UTM convention (use everywhere):

```text
utm_source=google|linkedin|newsletter|github
utm_medium=cpc|organic|social|email
utm_campaign=<phase>_<offer>     e.g. g1_api_inventory
utm_content=<creative_id>
utm_term=<keyword>               # search only
```

---

### C5. Before turning spend on

1. [ ] Phase A gate green
2. [ ] Analytics receiving events (C2 + M1)
3. [ ] At least one campaign LP live (`/lp/...` — agent stream M3) **or** consciously accept homepage-only for $0 learning
4. [ ] Ad copy reviewed against banned claims (no “blocks attacks”, no fake customers, no inventing prices)
5. [ ] Daily caps set; you know how to pause

Detail: [MARKETING_PLAN.md](./MARKETING_PLAN.md) phases G0–G1.

**Phase C gate:** Accounts exist, measurement works, spend is intentional and capped.

---

## Phase D — Optional / later

| Item | When |
| --- | --- |
| Show HN / LinkedIn launch post | After Phase A |
| Design-partner quotes | Before cold ads scale |
| Lifecycle activation emails (beyond magic link) | After Resend; agent M8 |
| Campaign LP + Google/LinkedIn copy packages | Agents M3–M5; you approve (N-M3) |
| Live Stripe | After test Checkout is boringly reliable |
| Protect / “API security platform” ads | Only after [PROTECT_MODE.md](./PROTECT_MODE.md) PM2 + explicit unlock |
| Nest / Next / Hono / proxy connectors | Product backlog, not launch blockers |
| Password reset | Deferred (magic-link oriented) |

---

## Quick env cheat sheet (Railway **core**)

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL` | Who sees `/admin` |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Magic link + invites |
| `STRIPE_SECRET_KEY` | Checkout / Portal |
| `STRIPE_WEBHOOK_SECRET` | Webhook verify |
| `STRIPE_PRICE_PRO` | Optional Pro price fallback |
| `MARKETING_URL` | Should be `https://apiglimpse.com` |
| `FRONTEND_URLS` / `COOKIE_DOMAIN` | Already set for `*.apiglimpse.com` |
| `CONTACT_SALES_EMAIL` / `CONTACT_SALES_URL` | Optional Enterprise routing |

**Render (static):** rebuild Marketing/Dashboard if you change `VITE_API_URL`, `VITE_COLLECT_URL`, or future analytics `VITE_*` vars.

**Never** put Stripe/Resend secrets on Render, ingest, or agent.

---

## Suggested calendar of effort (not dates — order only)

1. **Today / next session:** A1 Resend → A2 Admin → A4 publish (npm first) → A5 smoke  
2. **Same week:** B1–B4 Stripe test + lock Pro catalog  
3. **Before ads:** C1–C4 accounts + analytics; launch agents M1/M3 if needed  
4. **First spend:** Tiny Google Search + LinkedIn tests only after C5  
5. **Later:** Live Stripe, announce, protect epic  

---

## Related docs (detail, not the checklist)

| Doc | Use when |
| --- | --- |
| [LAUNCH_NEXT.md](./LAUNCH_NEXT.md) | Resend + publish + smoke |
| [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md) | Multi-language publish |
| [NPM_PUBLISH.md](./NPM_PUBLISH.md) | npm org / 2FA deep dive |
| [STRIPE.md](./STRIPE.md) | Stripe + Admin plans |
| [ORG_PLAN_LIMITS.md](./ORG_PLAN_LIMITS.md) | Why catalog ≠ org entitlements |
| [MARKETING_PLAN.md](./MARKETING_PLAN.md) | Positioning, ads, M0–M8 |
| [MARKETING_READY.md](./MARKETING_READY.md) | Product readiness streams (mostly done on main) |
| [PROTECT_MODE.md](./PROTECT_MODE.md) | Future blocking — not launch |
| [TESTING.md](./TESTING.md) | Manual verification |

---

## Done when (north-star for “ready to market”)

- [ ] Magic-link email works in production  
- [ ] All advertised connectors install from public registries  
- [ ] E2E smoke green on at least Express + one other stack  
- [ ] Admin can edit catalog; existing orgs keep snapshots  
- [ ] Stripe **test** Checkout assigns Pro correctly (if selling Pro)  
- [ ] Analytics account chosen; events visible before paid spend  
- [ ] LinkedIn company + Google Ads accounts exist with budget caps  
- [ ] You have not advertised protect/blocking  
