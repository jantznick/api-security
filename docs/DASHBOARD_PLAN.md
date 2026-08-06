# Dashboard SaaS productization

## Goals

1. Remove POC tone; make `frontend/` the API Glimpse SaaS app
2. Better UX: app shell, projects, inventory, endpoint detail, account
3. Mirror vacation-home login/register/magic-link + app-shell patterns ([vacation-home](https://github.com/jantznick/vacation-home))
4. Verify backend auth vs vacation-home (already largely identical; only email brand fixes)
5. Out of scope: new backend product APIs, marketing-site embedded login (follow-on), billing

**Visual:** marketing forest teal (Syne / Figtree / signal). **UX reference:** vacation-home.

## Backend auth verdict

- `auth.js` / `middleware/auth.js` / sessions: **MATCH**
- Fix only: email monogram/subjects in `backend/services/email` (`AS` → **API Glimpse**)

## Target IA

| Route | Purpose |
| --- | --- |
| `/login`, `/register` | Auth |
| `/projects` | Home |
| `/projects/:id` | Inventory |
| `/projects/:id/endpoints/:eid` | Endpoint detail |
| `/projects/:id/settings` | Keys via existing `createApiKey` |
| `/account` | Account |

- Authed `/` → `/projects`
- Kill POC Home

## Phases

1. Tokens + AuthShell / Login / Register + email brand
2. AppLayout + Account + PageHeader / Card / FormField
3. Projects / inventory / settings UX; remove Demo project / demo empty states
4. Endpoint detail polish

**Deferred:** marketing login forms; rename/delete project APIs

## Success criteria

- No POC wording
- Vacation-home auth UX + API Glimpse brand
- Clear nav
- Build passes
