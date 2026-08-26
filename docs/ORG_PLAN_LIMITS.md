# Org plan-limit snapshots — multi-agent plan

**Audience:** Nick reviews → launches / continues parallel agents.  
**Why:** GTM needs to change catalog plan limits (Free/Pro/Enterprise) without rewriting entitlements for existing orgs/teams.  
**Extends:** [SAAS_PLAN.md](./SAAS_PLAN.md) S5 (org billing) and [STRIPE.md](./STRIPE.md).  
**Status:** **Shipped on main** (2026-08-26, PR #29) — PL1–PL4 in repo; migrate + redeploy if not yet applied. Catalog edits do **not** cascade to existing orgs.

Plan mode is unavailable in this Cloud Agent session; this doc is the reviewable plan of record.

---

## Problem

| Surface | Today | Desired |
| --- | --- | --- |
| Assignment | Org/User get `planSlug` only | Org gets **plan slug + frozen limits** |
| Seat enforcement | `org.planSlug` → live `Plan.seatLimit` | Prefer `org.seatLimit` |
| Endpoint enforcement | Partial snapshot on `Service`; fallback still live Plan | New services inherit **org** snapshot; template edits never cascade |
| Admin edits Plan row | Seats change for everyone on that slug | Catalog/marketing only; existing orgs unchanged |
| GTM price/limit experiments | Risky | Safe — bump Free for *new* signups only |

There is no separate Team model — **teams are Organizations**.

---

## Locked design (recommended defaults)

| # | Decision | Choice |
| --- | --- | --- |
| L1 | Snapshot target | **Organization** (`endpointLimit`, `seatLimit`, optional `planAssignedAt`) |
| L2 | When to snapshot | On **assign / apply** (Stripe webhook, admin assign, personal-org create) |
| L3 | Template edits | `PUT /api/admin/plans` updates **Plan catalog only** — never org columns or services |
| L4 | Resolution order | Org snapshot → if null, legacy fallback to Plan by slug (one release) → then constants |
| L5 | Service.endpointLimit | Still per-service; on apply, set from **org snapshot**; on create, copy from owning org |
| L6 | User.planSlug | Keep until S5; `applyPlanToUser` snapshots onto **owned personal orgs** (and syncs their services) |
| L7 | Re-sync | Explicit admin action only (`POST …/resync-limits` or assign again) — never implicit |
| L8 | Catalog / marketing | Keep reading live `Plan` (pricing page, checkout) |
| L9 | Non-goals | Plan version table, metered Stripe usage, changing billing unit (still user until S5) |

---

## How to run in parallel

| Rule | Detail |
| --- | --- |
| One agent per workstream ID (`PL1`…`PL5`) | Avoid two agents editing the same files |
| Respect **Blocked by** | Don’t start PL3/PL4 before PL1 schema lands |
| Same Prisma file | Only **PL1** edits `schema.prisma` + migrations |
| Core lib | Only **PL2** owns `plans.js` / `seats.js` / `orgs.js` until PL2 merges |
| Cost | No Stripe account work; no Railway plan upgrades |

Suggested waves:

1. **PL1 ∥ PL5(docs draft)** — schema + this plan’s docs stubs  
2. **PL2** — apply/resolve (blocked by PL1)  
3. **PL3 ∥ PL4** — routes + Admin UI (blocked by PL2 API shape)

---

## Workstream overview

| ID | Name | Depends on | Ships |
| --- | --- | --- | --- |
| **PL1** | Schema + backfill migration | — | Org limit columns; existing orgs filled from Plan |
| **PL2** | Apply & resolve core | PL1 | Snapshot on assign; seats/endpoints prefer org |
| **PL3** | API consumers | PL2 | usage / billing / auth / projects / admin assign responses |
| **PL4** | Admin & product UI | PL2 (+ PL3 for response fields) | Seat limit in Admin plans; show org limits; optional resync |
| **PL5** | Docs | PL1 design | STRIPE.md + SAAS_PLAN S5 notes + this file |

---

## PL1 — Schema + migration

**Touches:**

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/<ts>_org_plan_limit_snapshots/`

**Add on `Organization`:**

```prisma
/// Snapshotted from Plan on assign. null = unlimited (or legacy → resolve from Plan).
endpointLimit  Int?
/// Snapshotted seat cap. null = unlimited.
seatLimit      Int?
/// When plan+limits were last applied to this org
planAssignedAt DateTime?
```

**Migration:**

1. `ALTER TABLE "Organization" ADD COLUMN …`  
2. Backfill from `Plan` by `Organization.planSlug` (fallback Free constants if missing).  
3. Do **not** rewrite `Service.endpointLimit` in migration (already denormalized; next apply/create keeps consistency).

**Success criteria:**

- Every existing org has `endpointLimit` / `seatLimit` populated from its slug’s Plan at migrate time.  
- Prisma client generates cleanly for backend + ingest.

**Out of scope:** Route rewrites, Admin UI.

---

## PL2 — Apply & resolve core

**Touches:**

- `backend/lib/plans.js`
- `backend/lib/seats.js`
- `backend/lib/orgs.js`

**Tasks:**

1. Add `applyPlanToOrganization(orgId, planSlug, { stripeSubscriptionId }?)`:
   - Load Plan template once  
   - Write `planSlug`, `endpointLimit`, `seatLimit`, `planAssignedAt=now()` onto org  
   - `Service.updateMany` in that org → `endpointLimit` from snapshot  
2. Change `applyPlanToUser` to call org apply for **personal owned orgs** (keep user.planSlug + Stripe ids).  
3. `ensurePersonalOrg`: on **create**, set org limits from Plan (not slug-only).  
4. `getOrgSeatStatus`: prefer `org.seatLimit`; fallback to `resolveSeatLimit(planSlug)` only if column null.  
5. Export helpers e.g. `orgEndpointLimit(org)` / document resolution order.  
6. Stop `ensureDefaultPlans` update path from implying “product constants override live customer entitlements” — seatLimit on **Plan** catalog sync is fine; org snapshots stay untouched.

**Success criteria:**

- Assign Pro → org columns match Plan at that moment.  
- Edit Free `seatLimit` in Admin → existing Free orgs unchanged; new assigns get new value.  
- Invites still enforce using org snapshot.

**Out of scope:** Frontend, marketing catalog.

---

## PL3 — API consumers

**Touches:**

- `backend/routes/usage.js`
- `backend/routes/billing.js`
- `backend/routes/auth.js`
- `backend/routes/projects.js`
- `backend/routes/admin.js` (assign response may include org limits; **PUT plans stays catalog-only**)
- Optionally `backend/routes/orgs.js` if seat payload should expose snapshotted fields

**Tasks:**

1. New service create: resolve limit from **owning org** snapshot (not `user.planSlug` → live Plan).  
2. `/usage/me`, `/billing/me`, `/auth/me` orgs: report limits from org (and/or services), not re-query Plan for seats when org has snapshot.  
3. Admin assign response: include snapshotted `seatLimit` / org id(s) updated.  
4. Confirm webhook path still only goes through `applyPlanToUser` → org snapshot.

**Success criteria:**

- Creating a service under an old Free org (endpointLimit=25) after catalog bumps to 50 still gets **25**.  
- Seat invite blocks use org.seatLimit.

---

## PL4 — Admin & product UI

**Touches:**

- `frontend/src/pages/Admin.jsx` — show/edit `seatLimit` on plan drafts; copy that template edits don’t affect existing orgs  
- Optional: Admin “Re-apply plan limits to user/org” (same as assign)  
- Light copy on Billing/Usage if useful (“your org’s limits”)

**Success criteria:**

- Admin can set seat + endpoint on catalog plans.  
- UI makes non-cascade behavior obvious (short note near Plans editor).

**Out of scope:** Full org-billing Admin console (S5).

---

## PL5 — Docs

**Touches:**

- `docs/ORG_PLAN_LIMITS.md` (this file)  
- `docs/STRIPE.md` — snapshot semantics  
- `docs/SAAS_PLAN.md` — S5 note: assign copies limits onto org  

**Success criteria:** Ops can answer “does editing Free change existing customers?” with **No**.

---

## Agent prompt stubs

### PL1

> Implement org plan-limit snapshot schema per `docs/ORG_PLAN_LIMITS.md` PL1. Add `endpointLimit`, `seatLimit`, `planAssignedAt` on Organization; migration backfills from Plan by planSlug. Do not change apply/resolve logic beyond what compile requires. Do not edit Admin UI.

### PL2

> Implement apply/resolve per `docs/ORG_PLAN_LIMITS.md` PL2. Snapshot limits in `applyPlanToOrganization` / `applyPlanToUser` / `ensurePersonalOrg`. Seats prefer `org.seatLimit`. Do not edit `schema.prisma`. Do not change frontend.

### PL3

> Update API consumers per `docs/ORG_PLAN_LIMITS.md` PL3. New services and usage/billing/auth must prefer org snapshotted limits. Keep `PUT /api/admin/plans` catalog-only.

### PL4

> Admin UI per `docs/ORG_PLAN_LIMITS.md` PL4. Expose seatLimit on plan editor; note that saving plans does not cascade to existing orgs.

---

## Test matrix (manual / later automated)

| Case | Expect |
| --- | --- |
| Migrate existing Free org | `seatLimit=3`, `endpointLimit=25` (or current Plan values) |
| Admin sets Free endpoints 25→50 | Existing Free org stays 25; new signup Free org gets 50 |
| Stripe checkout → Pro | Personal org snapshotted to Pro limits; services updated |
| Admin assign Free→Pro→Free | Org limits follow **each assign** snapshot |
| Invite at seat cap | Blocked using org.seatLimit |
| Marketing `/billing/plans` | Still live catalog |

---

## Relationship to S5

S5 moves Stripe customer/subscription onto Organization. This epic is a **prerequisite mindset**: entitlements already live on the org. When S5 lands, `applyPlanToOrganization` becomes the primary path; `applyPlanToUser` shrinks to a thin personal-org helper or is removed.
