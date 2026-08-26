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
  if (plan.contactSales) return 'Custom';
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
    slug: p.slug || p.id,
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
    contactSales: Boolean(p.contactSales),
  }));
}

function ContactSalesModal({ plan, open, onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setCompany('');
      setMessage('');
      setError('');
      setDone(false);
    }
  }, [open]);

  if (!open || !plan) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await billingAPI.contactSales({
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || undefined,
        message: message.trim() || undefined,
        planSlug: plan.slug || plan.id,
        source: 'marketing',
      });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not send your request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mkt-contact-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-line bg-canvas p-5 sm:p-6">
        {done ? (
          <div>
            <h2 id="mkt-contact-title" className="font-display text-xl font-bold text-ink">
              Request received
            </h2>
            <p className="mt-2 text-[0.975rem] text-muted">
              Thanks for your interest in {plan.name}. We’ll follow up soon.
            </p>
            <button type="button" className="btn btn-primary mt-6 w-full" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 id="mkt-contact-title" className="font-display text-xl font-bold text-ink">
              Contact sales — {plan.name}
            </h2>
            <p className="mt-1 text-[0.975rem] text-muted">
              Tell us a bit about your team and we’ll get back to you.
            </p>
            <div className="mt-5 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-ink">Name</span>
                <input
                  required
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-ink">Work email</span>
                <input
                  required
                  type="email"
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-ink">Company</span>
                <input
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  autoComplete="organization"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-ink">What are you looking for?</span>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Team size, API volume, timeline…"
                />
              </label>
            </div>
            {error ? (
              <p className="mt-3 text-sm" style={{ color: '#b91c1c' }}>
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary flex-1" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send request'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Pricing() {
  const { openAuth } = useAuthModal();
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [source, setSource] = useState('fallback'); // api | fallback
  const [loading, setLoading] = useState(hasConfiguredApiUrl());
  const [contactPlan, setContactPlan] = useState(null);

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
        <ul className="anim-rise-delay-3 mt-16 grid gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
          {plans.map((plan) => {
            const price = formatPrice(plan);
            return (
              <li
                key={plan.id}
                className="border-t border-line pt-8 sm:border-t-0 sm:border-l sm:border-line sm:pl-8 sm:pt-0 first:border-l-0 first:pl-0"
              >
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
                {plan.contactSales ? (
                  <p className="mt-5">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setContactPlan(plan)}
                    >
                      Contact sales
                    </button>
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

      <ContactSalesModal
        plan={contactPlan}
        open={Boolean(contactPlan)}
        onClose={() => setContactPlan(null)}
      />
    </div>
  );
}
