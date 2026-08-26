# Stripe + admin plans setup

Billing is **user-level** (one subscription per account). When the plan changes, each owned project’s `endpointLimit` is updated from the Plan row in the database (not a shared pool across projects).

Plan **names, prices, endpoint caps, and Stripe Price IDs** are editable in the **Admin** dashboard (`/admin`) for the user whose email matches Railway env `ADMIN_EMAIL`.

Defaults (migration seed): **Free** (25 endpoints, $0) and **Pro** (500 endpoints, $29.00 display placeholder until Nick sets real cents / `stripePriceId`).

Helpers: `backend/lib/plans.js` (`applyPlanToUser`, fallback constants if DB empty).

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

## 3. Admin UI

1. Set `ADMIN_EMAIL` to your user email; redeploy core.
2. Sign in at `https://app.apiglimpse.com`.
3. Open **Admin** in the nav (only visible when `user.isAdmin`).
4. Edit Free/Pro **endpoint limits** and **monthly price (cents)**; set Pro **Stripe Price ID**.

---

## 4. API surface

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/billing/plans` | Public | Active plans only |
| GET | `/api/billing/me` | Session | Plan, usage, limits, checkout/portal flags |
| POST | `/api/billing/checkout` | Session | Checkout Session URL (503 if no secret) |
| POST | `/api/billing/portal` | Session | Customer Portal URL |
| POST | `/api/billing/webhook` | Stripe sig | Raw body; mounted before JSON parser in `server.js` |
| GET | `/api/admin/overview` | Admin | SaaS KPIs: users, MRR estimate, usage, signup trend |
| GET | `/api/admin/users` | Admin | Paginated user directory (`?q=&plan=&limit=&offset=`) |
| GET/PUT | `/api/admin/plans` | Admin | Edit limits / prices / `stripePriceId` |

Dashboard: **`/admin`** (owner overview + plans) and **`/billing`** (user billing UI).

---

## 5. After deploy checklist

- [ ] `ADMIN_EMAIL` set; `/admin` visible  
- [ ] Plans seeded / edited  
- [ ] Test mode keys on Railway core  
- [ ] Webhook endpoint + secret  
- [ ] Test Checkout from `/billing`  
- [ ] Confirm project `endpointLimit` updates after subscribe  
