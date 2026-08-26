# Stripe + admin plans setup

Billing is **user-level** (one subscription per account). When the plan changes, each owned project’s `endpointLimit` is updated from the Plan row in the database.

Plan **names, prices, endpoint caps, and Stripe Price IDs** are editable in the **Admin** dashboard (`/admin`) for the user whose email matches Railway env `ADMIN_EMAIL`.

---

## 1. Railway env vars (core service)

In [Railway](https://railway.app) → project **api-glimpse** → service **core** → **Variables**:

| Variable | Required | Example / notes |
| --- | --- | --- |
| `ADMIN_EMAIL` | For admin UI | Your login email, e.g. `thenickjantz@gmail.com` |
| `STRIPE_SECRET_KEY` | For Checkout/Portal | `sk_test_…` (test) or `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | For webhooks | `whsec_…` from Stripe webhook endpoint |
| `STRIPE_PRICE_PRO` | Optional shortcut | Can also paste Price IDs into Admin → Plans |
| `FRONTEND_URLS` | Already set | Must include `https://app.apiglimpse.com` |
| `MARKETING_URL` | Already set | `https://apiglimpse.com` |

Optional:

| Variable | Notes |
| --- | --- |
| `STRIPE_PUBLISHABLE_KEY` | Only if we add client-side Stripe.js later (`pk_test_…`) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Magic-link email ([LAUNCH_NEXT.md](./LAUNCH_NEXT.md)) |

Redeploy **core** after changing variables (or rely on Railway auto-restart).

**Do not** commit secrets or paste them into chat.

---

## 2. Stripe Dashboard

1. Create a [Stripe](https://dashboard.stripe.com) account (start in **Test mode**).
2. **Products** → create **Pro** (and Free is app-default, usually no Stripe product).
3. Add a **recurring monthly Price**; copy `price_…`.
4. Paste that ID into Admin → Plans → Pro → `stripePriceId` (or set `STRIPE_PRICE_PRO` on Railway).
5. **Developers → Webhooks → Add endpoint**:
   - URL: `https://api.apiglimpse.com/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
6. Copy the webhook **Signing secret** → `STRIPE_WEBHOOK_SECRET`.

---

## 3. Admin UI

1. Set `ADMIN_EMAIL` to your user email; redeploy core.
2. Sign in at `https://app.apiglimpse.com`.
3. Open **Admin** in the nav (only visible when `user.isAdmin`).
4. Edit Free/Pro **endpoint limits** and **monthly price (cents)**; set Pro **Stripe Price ID**.

Until Stripe keys exist, Checkout/Portal return a clear “not configured” error; plans/limits still work for caps via admin + `Project.endpointLimit`.

---

## 4. After deploy checklist

- [ ] `ADMIN_EMAIL` set; `/admin` visible  
- [ ] Plans seeded / edited  
- [ ] Test mode keys on Railway core  
- [ ] Webhook endpoint + secret  
- [ ] Test Checkout from `/billing`  
- [ ] Confirm project `endpointLimit` updates after subscribe  
