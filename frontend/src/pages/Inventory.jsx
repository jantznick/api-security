import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { billingAPI, inventoryAPI, projectsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import { COLLECT_URL, integratingDocsUrl } from '../lib/urls';

function severityClass(severity) {
  if (severity === 'high') return 'bg-danger-50 text-danger-700';
  if (severity === 'medium') return 'bg-warn-50 text-warn-700';
  return 'bg-ink-100 text-ink-700';
}

/** Near/at endpoint cap from GET /billing/me — null if billing API missing. */
function usageCapBanner(me, serviceId) {
  if (!me || typeof me !== 'object') return null;

  // Prefer per-service usage from billing/me.services (projects alias kept)
  const rows = Array.isArray(me.services) ? me.services : me.projects;
  if (serviceId && Array.isArray(rows)) {
    const row = rows.find((p) => p.id === serviceId);
    if (row) {
      const used = row.endpointCount;
      const limit = row.endpointLimit;
      if (typeof used === 'number' && limit != null && limit > 0 && used >= limit * 0.8) {
        return { atCap: used >= limit, used, limit };
      }
      return null;
    }
  }

  const used =
    me.endpointUsageTotal ??
    me.endpointsUsed ??
    me.endpointCount ??
    me.usage?.endpoints ??
    null;
  const limit =
    me.endpointLimitPerProject ??
    me.endpointLimit ??
    me.limit ??
    me.usage?.endpointLimit ??
    null;
  if (typeof used !== 'number' || limit == null || limit === 0) return null;
  const cap = Number(limit);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  if (used < cap * 0.8) return null;
  return { atCap: used >= cap, used, limit: cap };
}

export default function Inventory() {
  const { projectId, serviceId } = useParams();
  const [service, setService] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [posture, setPosture] = useState(null);
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [capBanner, setCapBanner] = useState(null);

  const basePath = `/projects/${projectId}/services/${serviceId}`;

  const riskByEndpointId = useMemo(() => {
    const map = new Map();
    for (const ep of posture?.endpoints || []) {
      if (ep?.id) map.set(ep.id, ep);
    }
    return map;
  }, [posture]);

  const visibleEndpoints = useMemo(() => {
    if (!highRiskOnly) return endpoints;
    return endpoints.filter((ep) => riskByEndpointId.get(ep.id)?.severity === 'high');
  }, [endpoints, highRiskOnly, riskByEndpointId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, e, postureRes] = await Promise.all([
        projectsAPI.getService(projectId, serviceId),
        inventoryAPI.listEndpoints(serviceId),
        inventoryAPI.getPosture(serviceId).catch(() => null),
      ]);
      setService(p.service);
      setEndpoints(e.endpoints || []);
      setPosture(postureRes);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, serviceId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    billingAPI
      .me()
      .then((data) => {
        if (!cancelled) setCapBanner(usageCapBanner(data, serviceId));
      })
      .catch(() => {
        if (!cancelled) setCapBanner(null);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  const activeKeys = (service?.apiKeys || []).filter((k) => !k.revokedAt);
  const keyPrefix = activeKeys[0]?.keyPrefix;
  const [exporting, setExporting] = useState(false);

  const exportOpenApi = async () => {
    setExporting(true);
    try {
      const doc = await inventoryAPI.exportOpenApi(serviceId);
      const blob = new Blob([JSON.stringify(doc, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName =
        String(service?.name || 'api')
          .replace(/[^a-zA-Z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 64) || 'api';
      a.href = url;
      a.download = `${safeName}-openapi.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('OpenAPI export downloaded');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        breadcrumb={
          <Link to="/projects" className="text-sm text-ink-500 hover:text-ink-900">
            ← Projects
          </Link>
        }
        title={service?.name || 'Inventory'}
        description="Discovered endpoints (auto-refresh every 5s). Schemas and signals only — no raw bodies."
        actions={
          <>
            <Link to={`${basePath}/settings`}>
              <Button variant="secondary">Settings</Button>
            </Link>
            <Button
              variant="secondary"
              onClick={exportOpenApi}
              disabled={exporting || loading}
            >
              {exporting ? 'Exporting…' : 'Export OpenAPI'}
            </Button>
            <Button variant="secondary" onClick={load}>
              Refresh
            </Button>
          </>
        }
      />

      {capBanner ? (
        <div
          className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            capBanner.atCap
              ? 'border-warn-700/30 bg-warn-50 text-warn-700'
              : 'border-ink-200 bg-white text-ink-700'
          }`}
          role="status"
        >
          <p>
            {capBanner.atCap
              ? `Endpoint limit reached (${capBanner.used} / ${capBanner.limit}). New endpoints may not be recorded.`
              : `Approaching endpoint limit (${capBanner.used} / ${capBanner.limit}).`}
          </p>
          <Link
            to="/billing"
            className="font-medium text-signal-600 hover:text-signal-800"
          >
            View billing →
          </Link>
        </div>
      ) : null}

      {keyPrefix ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm">
          <p className="text-ink-600">
            API key prefix{' '}
            <code className="font-mono text-ink-900">{keyPrefix}…</code>
            {' — '}
            use the full key as <code className="font-mono">API_SENSOR_KEY</code>
          </p>
          <Link
            to={`${basePath}/settings`}
            className="font-medium text-signal-600 hover:text-signal-800"
          >
            Manage keys →
          </Link>
        </div>
      ) : null}

      {posture && endpoints.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-ink-900">Risk posture</span>
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${severityClass(posture.score)}`}
            >
              {posture.score}
            </span>
            <span className="text-ink-600">
              <span className="text-danger-700">{posture.highCount} high</span>
              {' · '}
              <span className="text-warn-700">{posture.mediumCount} medium</span>
              {' · '}
              <span className="text-ink-700">{posture.lowCount} low</span>
            </span>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-ink-700">
            <input
              type="checkbox"
              className="rounded border-ink-300 text-signal-600 focus:ring-signal-500"
              checked={highRiskOnly}
              onChange={(e) => setHighRiskOnly(e.target.checked)}
            />
            High risk only
          </label>
        </div>
      ) : null}

      <Card className="mt-8 overflow-hidden">
        {loading && endpoints.length === 0 ? (
          <p className="p-6 text-sm text-ink-600">Loading…</p>
        ) : endpoints.length === 0 ? (
          <EmptyState
            title="Connect middleware"
            description="Install the connector with your service API key so traffic appears here within seconds. Copy the install snippet from service settings."
            action={
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-left text-sm text-ink-600">
                  <p>
                    Collect URL:{' '}
                    <code className="font-mono text-ink-900">{COLLECT_URL}</code>
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    Set as <code className="font-mono">API_SENSOR_AGENT_URL</code>
                    {activeKeys.length === 0
                      ? ' · create an API key in settings first'
                      : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link to={`${basePath}/settings`}>
                    <Button type="button">Open install snippet</Button>
                  </Link>
                  <a
                    href={integratingDocsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-signal-600 hover:text-signal-800"
                  >
                    Integrating docs →
                  </a>
                </div>
              </div>
            }
          />
        ) : visibleEndpoints.length === 0 ? (
          <EmptyState
            title="No high-risk endpoints"
            description="Nothing currently scores high. Turn off the filter to see the full inventory."
            action={
              <Button type="button" variant="secondary" onClick={() => setHighRiskOnly(false)}>
                Show all endpoints
              </Button>
            }
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-ink-700">
              <tr>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Path template</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">Hits</th>
                <th className="px-4 py-3 font-medium">Auth</th>
                <th className="px-4 py-3 font-medium">Signals</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {visibleEndpoints.map((ep) => {
                const risk = riskByEndpointId.get(ep.id);
                const severity = risk?.severity || 'low';
                const reason = risk?.reasons?.[0];
                return (
                  <tr
                    key={ep.id}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-50/80"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`${basePath}/endpoints/${ep.id}`}
                        className="font-mono font-semibold text-ink-800"
                      >
                        {ep.method}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`${basePath}/endpoints/${ep.id}`}
                        className="font-mono text-ink-900 hover:underline"
                      >
                        {ep.pathTemplate}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`w-fit rounded px-1.5 py-0.5 text-xs font-medium ${severityClass(severity)}`}
                        >
                          {severity}
                        </span>
                        {reason ? (
                          <span
                            className="max-w-[14rem] truncate text-xs text-ink-500"
                            title={(risk?.reasons || []).join('; ')}
                          >
                            {reason}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{ep.hitCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(ep.authModes) ? ep.authModes : []).map((m) => (
                          <span
                            key={m}
                            className={`rounded px-1.5 py-0.5 text-xs ${severityClass(m === 'none' ? 'low' : 'medium')}`}
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{ep._count?.signals ?? 0}</td>
                    <td className="px-4 py-3 text-ink-600">
                      {ep.lastSeenAt ? new Date(ep.lastSeenAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </AppLayout>
  );
}
