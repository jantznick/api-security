# Next phase — billing foundation → Stripe

## Prior plan status

| Prior plan | Status |
| --- | --- |
| Dashboard SaaS (`docs/DASHBOARD_PLAN.md`) | **Done** (AuthModal, shell, projects, inventory, keys create, marketing auth) |
| Railway Phase 0 + repo prep | **Done** |
| Soft-launch infra (Railway/Render/DNS) | **Done** (ops left: Resend + npm — [LAUNCH_NEXT.md](./LAUNCH_NEXT.md)) |

Do **not** re-run those plans.

---

## Product goal

Move from “works for early users” → “can charge for discovered endpoints” without rushing a half-baked pricing page.

Locked earlier: **per-API-endpoint** billing later via Stripe. Ingest already has a global `ENDPOINT_LIMIT` stub; Stripe should set **per-project** limits.

---

## Phase A — Billing foundation (build now)

No Stripe account required. Unlocks paid later without a schema rewrite.

1. **API key revoke** — soft-revoke (`revokedAt`); ingest rejects revoked keys; UI revoke action  
2. **Per-project `endpointLimit`** — `Project.endpointLimit` (`null`/`0` = unlimited); ingest prefers project limit, falls back to env `ENDPOINT_LIMIT`  
3. **Install snippet** — project settings show copy-paste middleware + `API_SENSOR_AGENT_URL=https://collect.apiglimpse.com` + key placeholder  

## Phase B — Stripe (next, needs Nick: Stripe account + keys)

1. Plans: Free / Pro (endpoint caps TBD)  
2. Checkout Session + Customer Portal  
3. Webhooks: map subscription → `project.endpointLimit` (+ `stripeCustomerId` / `stripeSubscriptionId` on User or Project)  
4. Dashboard billing page (current plan, usage vs cap, manage billing)  
5. Marketing pricing page only after plans are real  

**Cost note:** Stripe itself has no fixed fee; Railway/Render unchanged. Adding Stripe secret keys is Nick-only.

## Phase C — Product credibility (after A, parallel with B)

- OpenAPI export from inventory  
- Org / invite members (multi-seat) — after single-player billing works  
- Usage metering events for Stripe metered items (if we move from seat/cap to pure metered)  
- Protect mode — still deferred ([PROTECT_MODE.md](./PROTECT_MODE.md))  

---

## Explicit non-goals (this phase)

- Password reset (deferred)  
- Customer-hosted agent  
- Fake pricing page before Stripe  
- Plan upgrades on Railway/Render  

---

## Success criteria (Phase A)

- [ ] Revoked key → agent/ingest **401**  
- [ ] Project with `endpointLimit=N` skips *new* endpoints after N; existing still update  
- [ ] Settings page: revoke + install snippet  
- [ ] Migration applies cleanly (`prisma migrate`)  
