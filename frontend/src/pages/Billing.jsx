import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError, billingAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

function formatLimit(limit) {
  if (limit == null || limit === 0) return 'Unlimited';
  return String(limit);
}

function formatPriceCents(cents) {
  if (typeof cents !== 'number') return null;
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/mo`;
}

/**
 * Normalize GET /billing/me (W3 shape) with loose fallbacks for older stubs.
 */
function normalizeMe(data) {
  if (!data || typeof data !== 'object') return null;

  const planObj = data.plan && typeof data.plan === 'object' ? data.plan : null;
  const planSlug = data.planSlug || planObj?.slug || data.planId || null;
  const planName = planObj?.name || data.planName || (planSlug ? String(planSlug) : 'Unknown');

  const endpointLimit =
    data.endpointLimitPerProject ??
    planObj?.endpointLimit ??
    data.endpointLimit ??
    data.limit ??
    null;

  const endpointsUsed =
    data.endpointUsageTotal ??
    data.endpointsUsed ??
    data.endpointCount ??
    null;

  const stripe = data.stripe && typeof data.stripe === 'object' ? data.stripe : {};

  return {
    planSlug,
    planName: String(planName),
    endpointsUsed: typeof endpointsUsed === 'number' ? endpointsUsed : null,
    endpointLimit:
      endpointLimit == null || endpointLimit === ''
        ? null
        : Number(endpointLimit),
    priceCentsMonthly:
      typeof planObj?.priceCentsMonthly === 'number'
        ? planObj.priceCentsMonthly
        : null,
    projects: Array.isArray(data.projects) ? data.projects : [],
    stripeConfigured: Boolean(stripe.configured ?? data.checkoutAvailable),
    hasCustomer: Boolean(stripe.hasCustomer ?? data.portalAvailable),
    hasSubscription: Boolean(stripe.hasSubscription),
    limitScope: data.limitScope || 'per_project',
  };
}

function normalizePlans(data) {
  const list = Array.isArray(data?.plans) ? data.plans : Array.isArray(data) ? data : [];
  return list.map((p) => ({
    id: p.slug || p.id || p.name,
    slug: p.slug || p.id,
    name: p.name || p.slug || 'Plan',
    endpointLimit: p.endpointLimit ?? p.limit ?? null,
    priceCentsMonthly:
      typeof p.priceCentsMonthly === 'number'
        ? p.priceCentsMonthly
        : typeof p.priceMonthly === 'number'
          ? Math.round(p.priceMonthly * 100)
          : null,
    hasStripePrice: Boolean(p.hasStripePrice),
    description: p.description || null,
  }));
}

function billingUnavailableToast(err) {
  if (err instanceof ApiError && err.status === 503) {
    toast.error(
      err.message ||
        'Billing isn’t enabled yet. Stripe is not configured on this server.',
    );
    return true;
  }
  return false;
}

export default function Billing() {
  const [me, setMe] = useState(null);
  const [plans, setPlans] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | coming_soon | error
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await billingAPI.me();
      setMe(normalizeMe(data));
      setStatus('ready');
      try {
        const catalog = await billingAPI.plans();
        setPlans(normalizePlans(catalog));
      } catch {
        setPlans([]);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
        try {
          const catalog = await billingAPI.plans();
          setPlans(normalizePlans(catalog));
          setMe(null);
          setStatus('coming_soon');
        } catch {
          setMe(null);
          setPlans([]);
          setStatus('coming_soon');
        }
        return;
      }
      setStatus('error');
      toast.error(err.message || 'Could not load billing');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startCheckout = async (planSlug = 'pro') => {
    setBusy('checkout');
    try {
      const res = await billingAPI.checkout({ planSlug });
      if (res?.url) {
        window.location.assign(res.url);
        return;
      }
      toast.error('Checkout did not return a URL');
    } catch (err) {
      if (!billingUnavailableToast(err)) {
        toast.error(err.message || 'Checkout failed');
      }
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    try {
      const res = await billingAPI.portal();
      if (res?.url) {
        window.location.assign(res.url);
        return;
      }
      toast.error('Billing portal did not return a URL');
    } catch (err) {
      if (!billingUnavailableToast(err)) {
        toast.error(err.message || 'Could not open billing portal');
      }
    } finally {
      setBusy(null);
    }
  };

  const usageLabel =
    me && me.endpointsUsed != null
      ? me.limitScope === 'per_project'
        ? `${me.endpointsUsed} endpoints across projects (cap ${formatLimit(me.endpointLimit)} per project)`
        : `${me.endpointsUsed} / ${formatLimit(me.endpointLimit)} endpoints`
      : null;

  return (
    <AppLayout>
      <PageHeader
        breadcrumb={
          <Link to="/account" className="text-sm text-ink-500 hover:text-ink-900">
            ← Account
          </Link>
        }
        title="Billing"
        description="Upgrade and manage your subscription. For detailed quota, see Usage."
      />

      {status === 'loading' ? (
        <p className="mt-8 text-sm text-ink-600">Loading billing…</p>
      ) : null}

      {status === 'coming_soon' ? (
        <Card className="mt-8 p-6">
          <h2 className="font-display text-lg font-bold text-ink-900">
            Billing coming soon
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-600">
            Self-serve plans are not available on this server yet. Endpoint limits
            may still be configured by an admin. Check back after Stripe billing
            is enabled.
          </p>
          <p className="mt-4 text-sm">
            <Link
              to="/usage"
              className="font-medium text-signal-600 hover:text-signal-800"
            >
              See detailed usage →
            </Link>
          </p>
          {plans.length > 0 ? (
            <ul className="mt-6 space-y-4 border-t border-ink-100 pt-6">
              {plans.map((p) => (
                <li key={p.id}>
                  <p className="font-medium text-ink-900">{p.name}</p>
                  <p className="mt-1 text-sm text-ink-600">
                    Endpoint cap: {formatLimit(p.endpointLimit)}
                    {formatPriceCents(p.priceCentsMonthly)
                      ? ` · ${formatPriceCents(p.priceCentsMonthly)}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {status === 'error' ? (
        <Card className="mt-8 p-6">
          <p className="text-sm text-ink-600">
            Could not load billing. Try again in a moment.
          </p>
          <Button variant="secondary" className="mt-4" onClick={load}>
            Retry
          </Button>
        </Card>
      ) : null}

      {status === 'ready' && me ? (
        <Card className="mt-8 p-6">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-ink-500">Current plan</dt>
              <dd className="mt-1 font-display text-lg font-bold text-ink-900">
                {me.planName}
              </dd>
            </div>
            {usageLabel ? (
              <div>
                <dt className="font-medium text-ink-500">Endpoint usage</dt>
                <dd className="mt-1 text-ink-900">{usageLabel}</dd>
              </div>
            ) : me.endpointLimit != null ? (
              <div>
                <dt className="font-medium text-ink-500">Endpoint limit (per project)</dt>
                <dd className="mt-1 text-ink-900">{formatLimit(me.endpointLimit)}</dd>
              </div>
            ) : null}
            {me.projects.length > 0 ? (
              <div>
                <dt className="font-medium text-ink-500">Projects</dt>
                <dd className="mt-2 space-y-1">
                  {me.projects.map((p) => (
                    <div key={p.id} className="flex flex-wrap gap-x-3 text-ink-700">
                      <Link
                        to={`/projects/${p.id}`}
                        className="font-medium text-signal-600 hover:text-signal-800"
                      >
                        {p.name}
                      </Link>
                      <span>
                        {p.endpointCount ?? 0}
                        {' / '}
                        {formatLimit(p.endpointLimit)}
                      </span>
                    </div>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-8 flex flex-wrap gap-3 border-t border-ink-100 pt-6">
            <Button onClick={() => startCheckout('pro')} disabled={busy != null}>
              {busy === 'checkout' ? 'Opening…' : 'Upgrade'}
            </Button>
            <Button
              variant="secondary"
              onClick={openPortal}
              disabled={busy != null}
            >
              {busy === 'portal' ? 'Opening…' : 'Manage billing'}
            </Button>
          </div>
          <p className="mt-4 text-xs text-ink-500">
            Upgrade opens Stripe Checkout. Manage opens the customer portal.
            If Stripe is not configured, you’ll see a short notice instead.
          </p>
          <p className="mt-3 text-sm">
            <Link
              to="/usage"
              className="font-medium text-signal-600 hover:text-signal-800"
            >
              See detailed usage →
            </Link>
          </p>
        </Card>
      ) : null}

      {status === 'ready' && plans.length > 0 ? (
        <div className="mt-10">
          <h2 className="font-display text-lg font-bold text-ink-900">Plans</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {plans.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-ink-200 bg-white p-5"
              >
                <p className="font-display text-base font-bold text-ink-900">
                  {p.name}
                </p>
                <p className="mt-2 text-sm text-ink-600">
                  Endpoint cap: {formatLimit(p.endpointLimit)}
                </p>
                {formatPriceCents(p.priceCentsMonthly) ? (
                  <p className="mt-1 text-sm text-ink-700">
                    {formatPriceCents(p.priceCentsMonthly)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AppLayout>
  );
}
