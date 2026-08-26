# Next phase — billing foundation → Stripe

**Full parallel-agent plan of record:** [PARALLEL_PLAN.md](./PARALLEL_PLAN.md)

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

**UI (W4):** Dashboard `/billing` calls `GET /api/billing/me` (plan + usage), `POST /api/billing/checkout` and `/portal` (503 → toast if Stripe unset). Marketing `/pricing` prefers `GET /api/billing/plans` when `VITE_API_URL` is set; otherwise a soft Free/Pro placeholder with **no invented dollar amounts**. Inventory shows a soft banner when usage is near/at the cap from `/billing/me`.

**Cost note:** Stripe itself has no fixed fee; Railway/Render unchanged. Adding Stripe secret keys is Nick-only.

## Phase C — Product credibility (after A, parallel with B)

- OpenAPI export from inventory  
- **SaaS multi-seat / hierarchy** — plan of record: [SAAS_PLAN.md](./SAAS_PLAN.md) (account hub, usage/license page, Org→Project→Service, teams + RBAC). Start **S0+S1** anytime; **S2+** after single-player billing is stable.  
- Usage metering events for Stripe metered items (if we move from seat/cap to pure metered)  
- Protect mode — still deferred ([PROTECT_MODE.md](./PROTECT_MODE.md))  

## Phase D — Sales features / “Understand” pillar

**Plan of record:** [SALES_FEATURES_PLAN.md](./SALES_FEATURES_PLAN.md) (streams **SF0–SF8**: response capture harden, risk posture, drift alerts, topology, evidence export, gateway connector, tickets, protect phases, sales packaging).

Do **not** start SF streams that collide with unfinished Prisma work in SAAS/billing without coordinating file ownership.

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
