import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError, usageAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

function formatLimit(limit) {
  if (limit == null || limit === 0) return 'Unlimited';
  return String(limit);
}

function formatDate(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

function usageRatio(used, limit) {
  if (limit == null || limit <= 0) return 0;
  return Math.min(1, used / limit);
}

/** Match inventory banner: ≥80% near, ≥100% at limit. */
function quotaTone(used, limit) {
  if (limit == null || limit <= 0) return 'ok';
  if (used >= limit) return 'at';
  if (used >= limit * 0.8) return 'near';
  return 'ok';
}

function statusLabel(status, planSlug) {
  if (status === 'past_due') return 'Past due';
  if (status === 'free' || planSlug === 'free') return 'Free';
  if (status === 'active') return 'Active';
  return status ? String(status) : '—';
}

function barClass(tone) {
  if (tone === 'at') return 'bg-danger-700';
  if (tone === 'near') return 'bg-warn-700';
  return 'bg-signal-600';
}

function rowSurface(tone) {
  if (tone === 'at') return 'border-warn-700/30 bg-warn-50';
  if (tone === 'near') return 'border-ink-200 bg-white';
  return 'border-ink-200 bg-white';
}

export default function Usage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await usageAPI.me();
      setData(res);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      toast.error(
        err instanceof ApiError
          ? err.message || 'Could not load usage'
          : 'Could not load usage',
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const services = Array.isArray(data?.services) ? data.services : [];
  const nearOrAt = services.filter((s) => {
    const tone = quotaTone(s.endpointCount ?? 0, s.endpointLimit);
    return tone === 'near' || tone === 'at';
  });

  const seatsUsed = data?.seats?.used ?? null;
  const seatsLimit = data?.seats?.limit;
  const seatsLabel =
    seatsUsed == null
      ? null
      : seatsLimit == null
        ? `${seatsUsed} / Unlimited`
        : `${seatsUsed} / ${seatsLimit}`;

  return (
    <AppLayout>
      <PageHeader
        breadcrumb={
          <Link to="/account" className="text-sm text-ink-500 hover:text-ink-900">
            ← Account
          </Link>
        }
        title="Usage"
        description="What your license allows and what you have used across services."
        actions={
          <Link to="/billing">
            <Button variant="secondary">Billing</Button>
          </Link>
        }
      />

      {status === 'loading' ? (
        <p className="mt-8 text-sm text-ink-600">Loading usage…</p>
      ) : null}

      {status === 'error' ? (
        <Card className="mt-8 p-6">
          <p className="text-sm text-ink-600">
            Could not load usage. Try again in a moment.
          </p>
          <Button variant="secondary" className="mt-4" onClick={load}>
            Retry
          </Button>
        </Card>
      ) : null}

      {status === 'ready' && data ? (
        <div className="mt-8 space-y-8">
          {/* License */}
          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">License</h2>
            <p className="mt-1 text-sm text-ink-500">
              Plan entitlement for this account. Upgrade or manage payment on Billing.
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm font-medium text-ink-500">Plan</dt>
                <dd className="mt-1 font-display text-xl font-bold text-ink-900">
                  {data.plan?.name || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-ink-500">Status</dt>
                <dd className="mt-1 text-ink-900">
                  {statusLabel(data.plan?.status, data.plan?.slug)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-ink-500">Endpoint cap</dt>
                <dd className="mt-1 text-ink-900">
                  {formatLimit(data.plan?.endpointLimit)}
                  {data.limitScope === 'per_project' ? (
                    <span className="text-ink-500"> per service</span>
                  ) : null}
                </dd>
              </div>
            </dl>
            {(data.period?.start || data.period?.end) ? (
              <p className="mt-3 text-sm text-ink-600">
                Period:{' '}
                {data.period.start ? formatDate(data.period.start) : '—'}
                {' – '}
                {data.period.end ? formatDate(data.period.end) : '—'}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/billing">
                <Button>Upgrade or manage billing</Button>
              </Link>
            </div>
          </section>

          {/* Endpoint quota */}
          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">
              Endpoint quota
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Inventory endpoints used vs plan cap
              {data.limitScope === 'per_project'
                ? ' (limit applies per service)'
                : ''}
              . Today each project is one service.
            </p>

            {nearOrAt.length > 0 ? (
              <div
                className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                  nearOrAt.some(
                    (s) => quotaTone(s.endpointCount ?? 0, s.endpointLimit) === 'at',
                  )
                    ? 'border-warn-700/30 bg-warn-50 text-warn-700'
                    : 'border-ink-200 bg-white text-ink-700'
                }`}
                role="status"
              >
                {nearOrAt.some(
                  (s) => quotaTone(s.endpointCount ?? 0, s.endpointLimit) === 'at',
                )
                  ? `${nearOrAt.filter((s) => quotaTone(s.endpointCount ?? 0, s.endpointLimit) === 'at').length} service(s) at endpoint limit.`
                  : `${nearOrAt.length} service(s) approaching endpoint limit (≥80%).`}
              </div>
            ) : null}

            {services.length === 0 ? (
              <p className="mt-4 text-sm text-ink-600">
                No services yet.{' '}
                <Link
                  to="/projects"
                  className="font-medium text-signal-600 hover:text-signal-800"
                >
                  Create a project
                </Link>{' '}
                to start discovering endpoints.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {services.map((s) => {
                  const used = s.endpointCount ?? 0;
                  const limit = s.endpointLimit;
                  const tone = quotaTone(used, limit);
                  const pct = usageRatio(used, limit);
                  const unlimited = limit == null || limit <= 0;

                  return (
                    <li
                      key={s.id}
                      className={`rounded-lg border px-4 py-4 ${rowSurface(tone)}`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link
                          to={`/projects/${s.id}`}
                          className="font-medium text-signal-600 hover:text-signal-800"
                        >
                          {s.name}
                        </Link>
                        <span className="text-sm tabular-nums text-ink-800">
                          {used}
                          {' / '}
                          {formatLimit(limit)}
                          {tone === 'at' ? (
                            <span className="ml-2 text-danger-700">At limit</span>
                          ) : null}
                          {tone === 'near' ? (
                            <span className="ml-2 text-warn-700">Near limit</span>
                          ) : null}
                        </span>
                      </div>
                      {!unlimited ? (
                        <div
                          className="mt-3 h-2 overflow-hidden rounded bg-ink-100"
                          role="progressbar"
                          aria-valuenow={Math.round(pct * 100)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${s.name} endpoint usage`}
                        >
                          <div
                            className={`h-full rounded transition-[width] ${barClass(tone)}`}
                            style={{ width: `${Math.max(pct * 100, used > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                      ) : null}
                      <p className="mt-2 text-xs text-ink-500">
                        {s.apiKeyCount ?? 0} API key
                        {(s.apiKeyCount ?? 0) === 1 ? '' : 's'}
                        {' · '}
                        Last ingest: {formatDate(s.lastIngestAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Rollup */}
          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">Totals</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm font-medium text-ink-500">Endpoints</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums text-ink-900">
                  {data.totals?.endpoints ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-ink-500">Services</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums text-ink-900">
                  {data.totals?.services ?? services.length}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-ink-500">Projects</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums text-ink-900">
                  {data.totals?.projects ?? 0}
                </dd>
                <p className="mt-1 text-xs text-ink-500">
                  Parent projects after hierarchy ships; 0 for now.
                </p>
              </div>
            </dl>
          </section>

          {/* Seats */}
          <section>
            <h2 className="font-display text-lg font-bold text-ink-900">Seats</h2>
            <p className="mt-1 text-sm text-ink-500">
              Team members on this workspace. Free includes the owner (limit 3).
              Invites land in a later release.
            </p>
            <p className="mt-4 font-display text-2xl font-bold tabular-nums text-ink-900">
              {seatsLabel || '—'}
            </p>
            <p className="mt-1 text-sm text-ink-600">
              {seatsLimit == null
                ? 'No seat cap on this plan yet.'
                : `You are using ${seatsUsed} of ${seatsLimit} seats.`}
            </p>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}
