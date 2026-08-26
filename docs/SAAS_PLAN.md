# SaaS enhancement plan — account, usage, hierarchy, teams/RBAC

**Audience:** Nick reviews → locks decisions → spins workstreams.  
**Status:** Decisions locked (2026-08-26) — implementation in progress.  
**Supersedes / extends:** thin **W7** stub in [PARALLEL_PLAN.md](./PARALLEL_PLAN.md); Phase C “Org / invite members” in [NEXT_PHASE.md](./NEXT_PHASE.md).

Plan mode is unavailable in this Cloud Agent session; this doc is the reviewable plan of record.

---

## Why this plan

Today API Glimpse is a **single-player** SaaS:

| Surface | Current state |
| --- | --- |
| Account (`/account`) | Email + user id + sign out / billing link |
| Billing (`/billing`) | Plan name, endpoint totals per owned project, Stripe checkout/portal |
| Tenancy | `User` owns `Project` directly (`ownerId`) |
| Inventory unit | One project = one API surface (keys + endpoints) |
| Authz | Session user must own the project; platform admin = env `ADMIN_EMAIL` |
| Teams | None — no orgs, invites, roles, or shared access |

That is enough for soft launch and charging one person. It is **not** enough for a modern multi-seat API discovery product where a company runs several APIs and invites engineers.

---

## Product goals

1. **Account feels like a SaaS app** — profile, security, org memberships, preferences; not a stub card.
2. **Usage / license is explicit** — what the plan allows, what was used this period, per service, with clear limit behavior.
3. **Hierarchy supports many APIs** — `Organization → Project → Service`, where a **Service** is one middleware-connected API (today’s Project).
4. **Teams + RBAC** — invite members to an org; roles gate billing, invites, keys, and inventory writes.

Non-goals for this epic (keep deferred):

- Protect mode / runtime blocking ([PROTECT_MODE.md](./PROTECT_MODE.md))
- Customer-hosted agent
- SSO/SAML (design hook only; implement later)
- Fine-grained per-endpoint ACLs
- Metered Stripe usage items (cap-based plans stay primary)

---

## Locked decisions (Nick, 2026-08-26)

| # | Decision | Locked choice |
| --- | --- | --- |
| D1 | Tenancy root | **Organization** (company/team) is membership + billing boundary |
| D2 | Hierarchy | **Org → Project → Service** (multiple projects, each with services) |
| D3 | What maps to today’s Project | **Service** (keys, endpoints, inventory, OpenAPI export) |
| D4 | What is a Project | Named grouping of related services (e.g. “Payments”, “Internal tools”) |
| D5 | Personal workspace | On signup, auto-create **personal org** + default project; existing projects migrate into it |
| D5b | Org switcher | **Personal org always visible**; clear **Add organization** affordance in the switcher |
| D6 | Billing unit after orgs | **Organization** subscription (Stripe customer on org); owner/admin manage billing |
| D7 | Until orgs ship | Keep current **user-level** Stripe wiring; migrate customer id to org in S5 |
| D8 | Roles (v1) | Org-scoped: `owner` · `admin` · `member` · `viewer` |
| D9 | Project/service roles | **Deferred** — org role applies to all projects/services in v1 |
| D10 | Endpoint limits | Still **per Service** (same semantics as today’s per-project cap) |
| D11 | Seat limits | **Free = 3 total members** (owner counts). Pro seat cap TBD (treat as higher/unlimited until priced) |
| D12 | Invites | Email invite + token link (Resend); accept creates membership; enforce seat cap on invite/accept |

---

## Target information architecture

### Data hierarchy

```text
Organization          ← company / team; billing + members
  └── Project         ← product / initiative grouping
        └── Service   ← one API (middleware key + inventory)
              ├── ApiKey[]
              ├── Endpoint[] → Signal[]
              └── (future: environments, OpenAPI artifacts)
```

### Dashboard routes (proposed)

| Route | Purpose |
| --- | --- |
| `/` | Redirect → last org home or `/orgs/:orgId` |
| `/orgs/:orgId` | Org home: projects list + usage snapshot |
| `/orgs/:orgId/projects/:projectId` | Project home: services list |
| `/orgs/:orgId/projects/:projectId/services/:serviceId` | Inventory (today’s project inventory page) |
| `…/services/:serviceId/endpoints/:endpointId` | Endpoint detail |
| `…/services/:serviceId/settings` | Keys, install snippet, rename, danger zone |
| `/orgs/:orgId/settings` | Org profile, members, invites, danger zone |
| `/orgs/:orgId/usage` | **Usage & license** (plan, seats, endpoints by service) |
| `/orgs/:orgId/billing` | Checkout / portal (admins+owners) |
| `/account` | **User settings hub** (profile, security, orgs list) |
| `/account/security` | Password / magic-link preferences / sessions (v1 minimal) |
| `/invites/:token` | Accept invite (authed or register-then-accept) |
| `/admin` | Platform admin (unchanged; not customer RBAC) |

Deep links from marketing stay on `app.apiglimpse.com`. Prefer **stable redirects** from old `/projects/:id` → new service URLs during migration.

### App shell changes

- Org switcher in header: **personal org always listed**, then team orgs, plus an obvious **Add organization** action.
- Nav: **Projects** (scoped to current org) · **Usage** · **Billing** (role-gated) · **Account**.
- User menu: email, account settings, sign out (replace always-visible Sign out button over time).

---

## Workstream overview

| ID | Name | Depends on | Ships |
| --- | --- | --- | --- |
| **S0** | Account & settings hub (no orgs yet) | Soft-launch dashboard | Modern `/account` IA |
| **S1** | Usage & license page (user-scoped) | Billing `/me` already exists | Dedicated usage UI + richer metrics |
| **S2** | Schema: Org / Project / Service + migration | Nick lock D1–D5 | Prisma models + data backfill |
| **S3** | Authz layer + API rewrite | S2 | Membership checks replace `ownerId` checks |
| **S4** | Invites + members UI | S3 + Resend (N1) | Invite / accept / remove / role change |
| **S5** | Move billing to Organization | S3 + Stripe live | Org billing + usage page org-scoped |
| **S6** | Dashboard IA for hierarchy | S2–S3 | Projects → services UX, redirects |

Suggested sequence: **S0 ∥ S1** (safe now) → **S2 → S3 → S6** → **S4** → **S5**.

Do **not** parallel S2/S3 with unrelated Stripe schema edits without coordination — same Prisma file.

---

## S0 — Account page as a SaaS settings hub

### Problem

`/account` is a thin card. Modern SaaS apps treat Account as a **settings area** with sections, not a single dump of fields.

### UX

Split `/account` into a settings layout with side (or top) section nav:

1. **Profile** — email (read-only until change-email exists), optional display name, created date, user id (collapsed “Advanced”).
2. **Security** — sign-out everywhere (session revoke later), password set/change if password auth used, note that magic link remains available. Password reset can stay deferred; document as follow-on.
3. **Organizations** — list memberships (after S2); until then show “Personal workspace” placeholder + plan badge linking to billing/usage.
4. **Preferences** — timezone / empty for v1 (don’t invent dark-mode toggles).
5. **Shortcuts** — Usage, Billing, Docs.

### Backend (minimal for S0)

- Optional `User.displayName` (nullable).
- `PATCH /api/auth/me` for display name only.
- Keep `GET /api/auth/me` shape; add `displayName`, `planSlug` (already loadable), `orgs: []` stub until S2.

### Success criteria

- Account is multi-section, not one card with email + id.
- Billing/Usage reachable from Account without cluttering the first screen.
- No org schema required to ship S0.

---

## S1 — Usage & license page

### Problem

Billing mixes **plan commerce** (upgrade, portal) with **consumption**. Users need a page that answers: *What am I allowed to use, and what have I used?*

### UX — `/usage` (then `/orgs/:orgId/usage` after S5)

**One job:** show entitlement vs consumption.

| Block | Content |
| --- | --- |
| License | Plan name, billing period (if Stripe), status (free / active / past_due) |
| Endpoint quota | Per-service bars: `used / limit` (limit from service or plan default) |
| Rollup | Total endpoints across services; call out any service at/near cap |
| Keys activity | Optional: last key `lastUsedAt` per service (already on ApiKey) |
| Seats | Members used vs seat allowance (**Free = 3** including owner; Pro TBD) |

Keep **Upgrade / Manage billing** CTAs, but primary home for Stripe actions remains `/billing`.

### Backend

Extend `GET /api/billing/me` (or add `GET /api/usage/me`) to return:

```json
{
  "plan": { "slug": "pro", "name": "Pro", "endpointLimit": 500 },
  "period": { "start": null, "end": null },
  "services": [
    {
      "id": "…",
      "name": "Checkout API",
      "projectId": "…",
      "projectName": "Payments",
      "endpointCount": 42,
      "endpointLimit": 500,
      "apiKeyCount": 2,
      "lastIngestAt": "…"
    }
  ],
  "totals": { "endpoints": 42, "services": 1, "projects": 1 },
  "seats": { "used": 1, "limit": 3 }
}
```

Until S2, `services[]` = today’s projects (name mapping documented in API).

### Metering notes (future)

Endpoint **count** remains the billable/capped unit. Do **not** block on sample RPS metering for v1. If later: store daily ingest counters on Service; still keep inventory cap as the hard product limit.

### Success criteria

- User can see exact endpoint usage per inventory unit vs cap.
- Near-limit and at-limit states match inventory banner behavior.
- Page works with Stripe unset (show plan + usage only).

---

## S2 — Hierarchy schema & migration

### Models (Prisma sketch)

```prisma
enum OrgRole {
  owner
  admin
  member
  viewer
}

model Organization {
  id                   String       @id @default(uuid())
  name                 String
  slug                 String       @unique
  /// Personal orgs are 1:1 with a user; hidden from “create team” flows optionally
  isPersonal           Boolean      @default(false)
  stripeCustomerId     String?      @unique
  stripeSubscriptionId String?
  planSlug             String       @default("free")
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt
  memberships          Membership[]
  projects             Project[]
  invites              OrgInvite[]
}

model Membership {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(...)
  userId         String
  user           User         @relation(...)
  role           OrgRole      @default(member)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, userId])
  @@index([userId])
}

model OrgInvite {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(...)
  email          String
  role           OrgRole      @default(member)
  tokenHash      String       @unique
  invitedById    String
  expiresAt      DateTime
  acceptedAt     DateTime?
  revokedAt      DateTime?
  createdAt      DateTime     @default(now())

  @@index([organizationId, email])
}

model Project {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(...)
  name           String
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  services       Service[]

  @@index([organizationId])
}

model Service {
  id            String     @id @default(uuid())
  projectId     String
  project       Project    @relation(...)
  name          String
  endpointLimit Int?
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  apiKeys       ApiKey[]
  endpoints     Endpoint[]

  @@index([projectId])
}
```

`ApiKey` / `Endpoint` move from `projectId` → `serviceId`.

### Migration strategy (zero-downtime-ish)

1. Add `Organization`, `Membership`, `Project` (new), `Service` tables; keep old `Project` table temporarily **or** rename carefully in one migration with backfill.
2. Practical approach in one migrate deploy:
   - Rename today’s `Project` → `Service` (DB rename).
   - Create new `Organization`, `Membership`, new `Project`.
   - For each legacy owner: create personal org + membership(`owner`) + default project `"Default"`; set `Service.projectId`.
   - Copy `User.planSlug` / Stripe ids onto personal org (S5 can finish cutting User billing fields).
3. Core + ingest both use shared Prisma schema — regenerate both clients; update ingest key lookup to resolve `serviceId` (agent aggregators key off service id).
4. Dual-read period optional: API accepts old project ids as service ids via redirect map if rename is 1:1.

### Agent / middleware impact

- API keys still mint per **Service** (same UX as today’s project key).
- Ingest uniqueness `(serviceId, method, pathTemplate)`.
- No middleware package change if key semantics unchanged.

### Success criteria

- Existing users keep inventory after migrate.
- Each user has a personal org and can create additional projects/services.
- Ingest + dashboard still function end-to-end.

---

## S3 — Authorization layer (RBAC)

### Permission matrix (v1)

| Action | owner | admin | member | viewer |
| --- | --- | --- | --- | --- |
| View inventory / OpenAPI | ✓ | ✓ | ✓ | ✓ |
| Create/rename project or service | ✓ | ✓ | ✓ | |
| Manage API keys (create/revoke/rotate) | ✓ | ✓ | ✓ | |
| Invite / change roles / remove members | ✓ | ✓ | | |
| Transfer ownership / delete org | ✓ | | | |
| Billing checkout / portal | ✓ | ✓ | | |
| View usage | ✓ | ✓ | ✓ | ✓ |

Platform `/admin` stays separate (`ADMIN_EMAIL`).

### Implementation pattern

Replace `ownedProject(projectId, userId)` with:

```text
requireOrgRole(orgId, userId, minRole)
requireServiceAccess(serviceId, userId, minRole)
```

Centralize in `backend/lib/authz.js`. Every core route that today filters `ownerId` must use membership joins.

Session payload can cache `activeOrgId` later; v1 can pass org in URL and verify membership each request.

### Success criteria

- Non-members get 404/403 on org and service routes.
- Viewer cannot mint keys.
- Owner cannot be removed without transfer (enforce in API).

---

## S4 — Invites & members UI

### Flow

1. Admin/owner opens **Org settings → Members**.
2. Invite by email + role.
3. Resend email with link `https://app.apiglimpse.com/invites/:token`.
4. Recipient signs in / registers → accept → membership created; invite marked accepted.
5. List members + pending invites; revoke invite; remove member; change role (constraints: last owner protected).

### Backend

- `GET/POST /api/orgs/:orgId/invites`
- `POST /api/invites/:token/accept`
- `GET/PATCH/DELETE /api/orgs/:orgId/members/:userId`

Token stored hashed (same idea as API keys). TTL e.g. 7 days.

### Success criteria

- Second user can see shared service inventory without being the Stripe customer.
- Billing remains owner/admin-only.

---

## S5 — Billing moves to the organization

### Changes

- Stripe Customer + subscription ids live on `Organization`.
- `applyPlanToUser` becomes `applyPlanToOrganization` → sync `endpointLimit` to all **services** in the org.
- Usage + billing pages become org-scoped.
- Personal org keeps solo-dev UX identical.

### User.planSlug

Deprecate after backfill; `/auth/me` can expose `activeOrg.planSlug` for banners.

### Success criteria

- Upgrading Pro in a shared org raises caps for all services in that org.
- Personal and team orgs bill independently (two Stripe customers if user owns two orgs — acceptable).

---

## S6 — Dashboard hierarchy UX

### Projects list (org-scoped)

- Cards/rows: project name, service count, total endpoints, last activity.
- CTA: New project.

### Project home

- List services with endpoint counts and status (receiving traffic / never connected).
- CTA: Add service → name → mint first API key (reuse today’s create-project onboarding).

### Service inventory

- Reuse Inventory / Endpoint detail / Settings with updated routes and copy (“Service” not “Project” where it means the API unit).
- Install snippet unchanged aside from naming.

### Empty states

- No projects → create first project.
- Project with no services → add service + connect middleware (W2 onboarding patterns).

### Success criteria

- Multi-API customers can separate services without separate logins.
- Old bookmarks to `/projects/:id` redirect to the service inventory URL.

---

## Phased delivery vs soft-launch reality

| Phase | When | Notes |
| --- | --- | --- |
| Soft launch | Now | Single-player User→Project; S0+S1 improve polish without schema risk |
| Multi-API | After S2/S6 | Hierarchy without invites still helps solo users organizing many APIs |
| Multi-seat | After S4 | True team SaaS |
| Org billing | After S5 | Required before selling seats seriously |

Do not block Stripe user-billing (current W3/W4) on this epic — **S5 migrates** it.

---

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Big-bang rename breaks ingest | Ship migration + ingest deploy together; feature-flag dual ID if needed |
| RBAC bugs leak tenants | Integration tests for membership negative cases; default deny |
| UX jargon (Project vs Service) | Docs + empty-state copy; “Service = one API you install middleware on” |
| Personal vs team org confusion | Auto personal org; “Create team” explicit; org switcher labels |
| Scope creep into SSO / project roles | Explicitly deferred in this doc |

---

## Parallel agent boundaries (when building)

| Stream | Owns | Avoid |
| --- | --- | --- |
| S0 Account UI | `frontend` account routes/components; light `PATCH /auth/me` | Prisma tenancy models |
| S1 Usage UI | `/usage` page; billing/usage API response shape | Org invites |
| S2 Schema | `schema.prisma`, migrations, backfill script | Dashboard redesign |
| S3 Authz | `authz.js`, route guards, project/service APIs | Marketing |
| S4 Invites | invite routes, email templates, members UI | Stripe price changes |
| S5 Org billing | billing routes, plans apply-to-org | Inventory UX |
| S6 Hierarchy UI | App routes, Projects/Services pages, redirects | Migration SQL |

---

## Resolved questions

1. **Naming** — Org → Project → Service (multiple projects, services under each). ✅  
2. **Switcher** — Personal org always visible + easy Add organization. ✅  
3. **Free seats** — Up to **3 total team members** (owner included). ✅  
4. **Display name** — Include in S0 (optional field). ✅  
5. **Extra roles** — No `billing`-only role in v1; owner/admin cover billing. ✅  

**Still open:** Pro plan seat cap (number or unlimited) when pricing is finalized.

---

## Related docs

- [PARALLEL_PLAN.md](./PARALLEL_PLAN.md) — near-term W1–W8; W7 points here
- [NEXT_PHASE.md](./NEXT_PHASE.md) — billing foundation → Stripe; Phase C orgs
- [PRODUCTIZATION.md](./PRODUCTIZATION.md) — hosted multi-tenant agent path
- [DECISIONS.md](./DECISIONS.md) — product defaults
- [STRIPE.md](./STRIPE.md) — Stripe ops
- [DASHBOARD_PLAN.md](./DASHBOARD_PLAN.md) — completed dashboard SaaS pass
