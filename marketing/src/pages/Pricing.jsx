import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { billingAPI, hasConfiguredApiUrl } from '../api/api';
import { useAuthModal } from '../context/AuthModalContext';
import { APP_URL } from '../lib/urls';

/** Soft placeholder when API is missing — no invented Stripe dollar amounts. */
const FALLBACK_PLANS = [
  {
    id: 'free',
    name: 'Free',
    endpointLimit: null,
    priceMonthly: null,
    description:
      'Discover endpoints from real traffic. Endpoint limits are configured by an admin during soft launch.',
  },
  {
    id: 'pro',
    name: 'Pro',
    endpointLimit: null,
    priceMonthly: null,
    description:
      'Higher endpoint caps for growing APIs. Self-serve pricing appears here when billing is enabled.',
  },
];

function formatLimit(limit) {
  if (limit == null || limit === 0) return 'Configured by admin';
  return `${limit} endpoints`;
}

function formatPrice(plan) {
  if (typeof plan.priceCentsMonthly === 'number') {
    if (plan.priceCentsMonthly === 0) return 'Free';
    // Only show paid amounts from the API catalog (not invented client-side)
    const dollars = plan.priceCentsMonthly / 100;
    return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}/mo`;
  }
  if (typeof plan.priceMonthly !== 'number') return null;
  if (plan.priceMonthly === 0) return 'Free';
  const currency = (plan.currency || 'USD').toUpperCase();
  return `${currency} ${plan.priceMonthly}/mo`;
}

function normalizePlans(data) {
  const list = Array.isArray(data?.plans) ? data.plans : Array.isArray(data) ? data : [];
  return list.map((p) => ({
    id: p.slug || p.id || p.name,
    name: p.name || p.slug || 'Plan',
    endpointLimit: p.endpointLimit ?? p.limit ?? null,
    description: p.description || null,
    priceCentsMonthly:
      typeof p.priceCentsMonthly === 'number' ? p.priceCentsMonthly : null,
    priceMonthly:
      typeof p.priceMonthly === 'number'
        ? p.priceMonthly
        : typeof p.price === 'number'
          ? p.price
          : null,
    currency: p.currency || 'usd',
    hasStripePrice: Boolean(p.hasStripePrice),
  }));
}

export default function Pricing() {
  const { openAuth } = useAuthModal();
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [source, setSource] = useState('fallback'); // api | fallback
  const [loading, setLoading] = useState(hasConfiguredApiUrl());

  useEffect(() => {
    if (!hasConfiguredApiUrl()) {
      setPlans(FALLBACK_PLANS);
      setSource('fallback');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    billingAPI
      .plans()
      .then((data) => {
        if (cancelled) return;
        const next = normalizePlans(data);
        if (next.length > 0) {
          setPlans(next);
          setSource('api');
        } else {
          setPlans(FALLBACK_PLANS);
          setSource('fallback');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPlans(FALLBACK_PLANS);
        setSource('fallback');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="prose-page">
      <p className="section-eyebrow anim-rise">Pricing</p>
      <h1 className="anim-rise-delay-1 section-title mt-3 text-4xl sm:text-5xl">
        Simple plans for live API inventory
      </h1>
      <p className="anim-rise-delay-2 mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        Plans are based on how many endpoints you discover. We only show prices
        from the live billing catalog — never invented numbers.
      </p>

      {loading ? (
        <p className="mt-16 text-muted">Loading plans…</p>
      ) : (
        <ul className="anim-rise-delay-3 mt-16 grid gap-10 sm:grid-cols-2 sm:gap-8">
          {plans.map((plan) => {
            const price = formatPrice(plan);
            return (
              <li key={plan.id} className="border-t border-line pt-8 sm:border-t-0 sm:border-l sm:border-line sm:pl-8 sm:pt-0 first:border-l-0 first:pl-0">
                <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
                  {plan.name}
                </h2>
                {price ? (
                  <p className="mt-3 font-display text-xl font-semibold text-ink-soft">
                    {price}
                  </p>
                ) : (
                  <p className="mt-3 text-[0.975rem] text-muted">
                    Price set when billing is enabled
                  </p>
                )}
                <p className="mt-4 text-[0.975rem] leading-relaxed text-muted">
                  {plan.description ||
                    `Endpoint inventory cap: ${formatLimit(plan.endpointLimit)}.`}
                </p>
                {plan.description && plan.endpointLimit != null ? (
                  <p className="mt-3 text-sm text-muted">
                    Cap: {formatLimit(plan.endpointLimit)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {source === 'fallback' && !loading ? (
        <p className="mt-10 max-w-xl text-sm leading-relaxed text-muted">
          Live plan details are not available from the API yet. Soft-launch
          limits may still apply and are configured by an admin.
        </p>
      ) : null}

      <div className="mt-14 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => openAuth('register')}
          className="btn btn-primary"
        >
          Sign up
        </button>
        <a href={APP_URL} className="btn btn-secondary">
          Open dashboard
        </a>
        <Link to="/get-started" className="text-link">
          Setup guide →
        </Link>
      </div>
    </div>
  );
}
