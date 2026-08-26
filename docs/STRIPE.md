# Stripe + admin plans setup

Billing is **user-level** (one subscription per account). When a plan is **assigned** (Stripe webhook or Admin → Users), the catalog `Plan` limits are **snapshotted onto the user's personal Organization** (`planSlug`, `endpointLimit`, `seatLimit`, `planAssignedAt`) and copied onto each service’s `endpointLimit`. Editing a Plan in Admin updates the **catalog only** — existing orgs keep their snapshotted limits until you re-assign.

Plan **names, prices, endpoint/seat caps, Stripe Price IDs, and contact-sales flags** are editable in the **Admin** dashboard (`/admin`) for the user whose email matches Railway env `ADMIN_EMAIL`.

Defaults (migration seed): **Free** (25 endpoints, 3 seats, $0) and **Pro** (500 endpoints, unlimited seats, $29.00 display placeholder until Nick sets real cents / `stripePriceId`). Add **Enterprise** (or any other plan) from Admin → **Add plan** / **Add Enterprise**.

Helpers: `backend/lib/plans.js` (`applyPlanToUser`, `applyPlanToOrganization`, org limit resolvers). Design: [ORG_PLAN_LIMITS.md](./ORG_PLAN_LIMITS.md).

---

## 1. Railway env vars (core service)

**You set these in Railway** — this Cloud Agent cannot write your Railway variables from here (no Railway CLI/auth in this environment).

### `ADMIN_EMAIL` (required for `/admin`)

This is **not** optional if you want the Admin link. It must match the email you use to sign in to API Glimpse **exactly** (case-insensitive).

**Set it to:** `thenickjantz@gmail.com` (your account).

**Exact steps:**

1. Open [railway.app](https://railway.app) → project **api-glimpse**
2. Click service **core**
3. Tab **Variables**
4. **Add variable**
   - Name: `ADMIN_EMAIL`
   - Value: `thenickjantz@gmail.com`
5. Save (Railway usually redeploys core automatically; if not, **Redeploy**)
6. Sign out/in at `https://app.apiglimpse.com` (or hard refresh)
7. You should see **Admin** in the nav → `https://app.apiglimpse.com/admin`

If `ADMIN_EMAIL` is missing or doesn’t match your login email, `/admin` stays hidden and returns 403.

---

### Other core variables

In Railway → **api-glimpse** → **core** → **Variables**:

| Variable | Required | Example / notes |
| --- | --- | --- |
| `ADMIN_EMAIL` | For admin UI | `thenickjantz@gmail.com` |
| `STRIPE_SECRET_KEY` | For Checkout/Portal/webhooks | `sk_test_…` (test) or `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | For webhooks | `whsec_…` from Stripe webhook endpoint |
| `STRIPE_PRICE_PRO` | Optional shortcut | Fallback if Pro `Plan.stripePriceId` is empty; can also paste Price IDs into Admin → Plans |
| `FRONTEND_URLS` | Already set | Must include `https://app.apiglimpse.com` |
| `MARKETING_URL` | Already set | `https://apiglimpse.com` |

Optional:

| Variable | Notes |
| --- | --- |
| `STRIPE_PUBLISHABLE_KEY` | Only if we add client-side Stripe.js later (`pk_test_…`) |
| `CONTACT_SALES_EMAIL` | Mailto target for contact-sales plans when `contactUrl` is blank (defaults to `ADMIN_EMAIL`) |
| `CONTACT_SALES_URL` | Full URL override (Cal.com, Typeform, etc.) when plan `contactUrl` is blank |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Magic-link email ([LAUNCH_NEXT.md](./LAUNCH_NEXT.md)) |

Redeploy **core** after changing variables (or rely on Railway auto-restart).

**Do not** commit secrets, put them on Render/ingest/agent, or paste them into chat.

Without `STRIPE_SECRET_KEY`, `POST /api/billing/checkout` and `/portal` return **503** with a clear message (scaffold still boots; admin plans/limits work).

---

## 2. Stripe Dashboard

1. Create a [Stripe](https://dashboard.stripe.com) account (start in **Test mode**).
2. **Products** → create **Pro** (Free is app-default, usually no Stripe product).
3. Add a **recurring monthly Price**; copy `price_…`.
4. Paste that ID into Admin → Plans → Pro → `stripePriceId` (or set `STRIPE_PRICE_PRO` on Railway).
5. **Developers → Webhooks → Add endpoint**:
   - URL: `https://api.apiglimpse.com/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
6. Copy the webhook **Signing secret** → `STRIPE_WEBHOOK_SECRET`.

---

## 3. Admin UI — add & edit plans

1. Set `ADMIN_EMAIL` to your user email; redeploy core.
2. Sign in at `https://app.apiglimpse.com`.
3. Open **Admin** in the nav (only visible when `user.isAdmin`).
4. Scroll to **Plan configuration**.
5. Edit Free/Pro **endpoint limits** and **monthly price (cents)**; set Pro **Stripe Price ID**.
6. To add another self-serve plan: **Add plan** → set slug/name/limits/price/`stripePriceId` → **Save plans**.
7. To add Enterprise (contact sales): **Add Enterprise** (or Add plan + check **Contact sales**) → optional Contact URL → **Save plans**.

### Contact-sales / Enterprise flow

1. Plan has **Contact sales** checked → Checkout is disabled for that slug.
2. Billing + marketing pricing show **Contact sales**, which opens a short form (name, email, company, message).
3. Submissions land in Admin → **Sales leads** (mini inbox table).
4. After you close a deal, open Admin → **Users** → **Assign plan** → `enterprise` (syncs their service endpoint limits).

Optional: set plan **Contact URL** only if you want an external override; the in-app form is the default CTA.

---

## 4. API surface

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/billing/plans` | Public | Active plans only (includes `contactSales` / `contactUrl`) |
| GET | `/api/billing/me` | Session | Plan, usage, limits, checkout/portal flags |
| POST | `/api/billing/contact-sales` | Public | Submit Enterprise / contact-sales lead form |
| POST | `/api/billing/checkout` | Session | Checkout Session URL (400 if contact-sales; 503 if no secret) |
| POST | `/api/billing/portal` | Session | Customer Portal URL |
| POST | `/api/billing/webhook` | Stripe sig | Raw body; mounted before JSON parser in `server.js` |
| GET | `/api/admin/overview` | Admin | SaaS KPIs: users, MRR estimate, usage, signup trend |
| GET | `/api/admin/users` | Admin | Paginated user directory (`?q=&plan=&limit=&offset=`) |
| GET | `/api/admin/leads` | Admin | Contact-sales inquiries (mini CRM table) |
| PUT | `/api/admin/users/:id/plan` | Admin | Manually assign plan (Enterprise after sales) |
| GET/PUT | `/api/admin/plans` | Admin | Create/edit limits / prices / `stripePriceId` / contact-sales |

Dashboard: **`/admin`** (owner overview + plans) and **`/billing`** (user billing UI).

---

## 5. After deploy checklist

- [ ] `ADMIN_EMAIL` set; `/admin` visible  
- [ ] Plans seeded / edited; Enterprise added if desired  
- [ ] Test mode keys on Railway core  
- [ ] Webhook endpoint + secret  
- [ ] Test Checkout from `/billing` for Pro  
- [ ] Confirm Contact sales form on `/billing` + marketing `/pricing`  
- [ ] Confirm lead appears in Admin → Sales leads  
- [ ] Confirm org + service `endpointLimit` (and org `seatLimit`) snapshot after subscribe / admin assign  
- [ ] Confirm Admin → Plans save does **not** change existing org limits until re-assign  
