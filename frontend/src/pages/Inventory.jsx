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

function hasNoAuthObserved(ep) {
  const modes = Array.isArray(ep.authModes) ? ep.authModes : [];
  if (modes.length === 0) return true;
  return modes.every((m) => m === 'none');
}

function signalCount(ep) {
  return ep._count?.signals ?? 0;
}

function usageCapBanner(me, serviceId) {
  if (!me || typeof me !== 'object') return null;
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
    me.endpointUsageTotal ?? me.endpointsUsed ?? me.endpointCount ?? me.usage?.endpoints ?? null;
  const limit =
    me.endpointLimitPerProject ?? me.endpointLimit ?? me.limit ?? me.usage?.endpointLimit ?? null;
  if (typeof used !== 'number' || limit == null || limit === 0) return null;
  const cap = Number(limit);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  if (used < cap * 0.8) return null;
  return { atCap: used >= cap, used, limit: cap };
}

const filterControlClass =
  'rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-800 focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/20';

function downloadJson(filename, doc) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Inventory() {
  const { projectId, serviceId } = useParams();
  const [service, setService] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [events, setEvents] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [topology, setTopology] = useState(null);
  const [posture, setPosture] = useState(null);
  const [policySuggestions, setPolicySuggestions] = useState([]);
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [capBanner, setCapBanner] = useState(null);
  const [methodFilter, setMethodFilter] = useState('all');
  const [hasSensitiveSignals, setHasSensitiveSignals] = useState(false);
  const [noAuthObserved, setNoAuthObserved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingEvidence, setExportingEvidence] = useState(false);

  const basePath = `/projects/${projectId}/services/${serviceId}`;

  const riskByEndpointId = useMemo(() => {
    const map = new Map();
    for (const ep of posture?.endpoints || []) {
      if (ep?.id) map.set(ep.id, ep);
    }
    return map;
  }, [posture]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, e, ev, topo, postureRes, policyRes] = await Promise.all([
        projectsAPI.getService(projectId, serviceId),
        inventoryAPI.listEndpoints(serviceId),
        inventoryAPI.listEvents(serviceId, { limit: 10 }).catch(() => ({ events: [], unreadCount: 0 })),
        inventoryAPI.getTopology(serviceId).catch(() => null),
        inventoryAPI.getPosture(serviceId).catch(() => null),
        inventoryAPI.getPolicySuggestions(serviceId).catch(() => ({ suggestions: [] })),
      ]);
      setService(p.service);
      setEndpoints(e.endpoints || []);
      setEvents(ev.events || []);
      setUnreadCount(ev.unreadCount || 0);
      setTopology(topo);
      setPosture(postureRes);
      setPolicySuggestions(policyRes?.suggestions || []);
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

  const methods = useMemo(() => {
    const set = new Set();
    for (const ep of endpoints) {
      if (ep.method) set.add(ep.method);
    }
    return [...set].sort();
  }, [endpoints]);

  const filtersActive =
    methodFilter !== 'all' || hasSensitiveSignals || noAuthObserved || highRiskOnly;

  const filteredEndpoints = useMemo(() => {
    return endpoints.filter((ep) => {
      if (methodFilter !== 'all' && ep.method !== methodFilter) return false;
      if (hasSensitiveSignals && signalCount(ep) < 1) return false;
      if (noAuthObserved && !hasNoAuthObserved(ep)) return false;
      if (highRiskOnly && riskByEndpointId.get(ep.id)?.severity !== 'high') return false;
      return true;
    });
  }, [
    endpoints,
    methodFilter,
    hasSensitiveSignals,
    noAuthObserved,
    highRiskOnly,
    riskByEndpointId,
  ]);

  const clearFilters = () => {
    setMethodFilter('all');
    setHasSensitiveSignals(false);
    setNoAuthObserved(false);
    setHighRiskOnly(false);
  };

  const exportOpenApi = async () => {
    setExporting(true);
    try {
      const doc = await inventoryAPI.exportOpenApi(serviceId);
      const safeName =
        String(service?.name || 'api')
          .replace(/[^a-zA-Z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 64) || 'api';
      downloadJson(`${safeName}-openapi.json`, doc);
      toast.success('OpenAPI export downloaded');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const exportEvidence = async () => {
    setExportingEvidence(true);
    try {
      const pack = await inventoryAPI.exportEvidence(serviceId);
      const safeName =
        String(service?.name || 'api')
          .replace(/[^a-zA-Z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 64) || 'api';
      const day = String(pack.generatedAt || '').slice(0, 10) || 'export';
      downloadJson(`${safeName}-evidence-${day}.json`, pack);
      toast.success('Evidence pack downloaded');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExportingEvidence(false);
    }
  };

  const markAllRead = async () => {
    try {
      await inventoryAPI.markEventsRead(serviceId);
      toast.success('Events marked read');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        breadcrumb={
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <Link to="/projects" className="hover:text-ink-900">
              Projects
            </Link>
            <span aria-hidden>/</span>
            <Link
              to={`/projects?project=${projectId}`}
              className="hover:text-ink-900"
            >
              {service?.projectName || 'Project'}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-ink-700">{service?.name || 'Service'}</span>
          </div>
        }
        title={service?.name || 'Inventory'}
        description="Live endpoints from traffic. Schemas and signals only — no raw bodies."
        actions={
          <>
            <Link to={`/projects/${projectId}/topology`}>
              <Button variant="secondary">Topology</Button>
            </Link>
            <Link to={`${basePath}/settings`}>
              <Button variant="secondary">Service settings</Button>
            </Link>
            <Button
              variant="secondary"
              onClick={exportEvidence}
              disabled={exportingEvidence || loading}
            >
              {exportingEvidence ? 'Exporting…' : 'Evidence pack'}
            </Button>
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
          <Link to="/billing" className="font-medium text-signal-600 hover:text-signal-800">
            View billing →
          </Link>
        </div>
      ) : null}

      {keyPrefix ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm">
          <p className="text-ink-600">
            API key prefix <code className="font-mono text-ink-900">{keyPrefix}…</code>
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
              className="rounded border-ink-300 text-signal-600 focus:ring-signal-600/30"
              checked={highRiskOnly}
              onChange={(e) => setHighRiskOnly(e.target.checked)}
            />
            High risk only
          </label>
        </div>
      ) : null}

      {policySuggestions.length > 0 ? (
        <Card className="mt-6 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Protect suggestions</h2>
              <p className="mt-1 text-xs text-ink-500">
                Detect-only recommendations from inventory. Enable protect in settings to apply the
                MVP rule across sensitive unauthenticated routes.
              </p>
            </div>
            <Link to={`${basePath}/settings`}>
              <Button variant="secondary" className="min-h-9 px-3 py-1.5 text-sm">
                Open protect settings
              </Button>
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {policySuggestions.slice(0, 8).map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-900">{s.title}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${severityClass(s.severity)}`}
                  >
                    {s.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-600">{s.reason}</p>
                {s.rule?.match ? (
                  <p className="mt-1 font-mono text-xs text-ink-500">
                    {s.rule.action} · {s.rule.match.method} {s.rule.match.pathTemplate}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {policySuggestions.length > 8 ? (
            <p className="mt-3 text-xs text-ink-500">
              +{policySuggestions.length - 8} more suggestions
            </p>
          ) : null}
        </Card>
      ) : null}

      {events.length > 0 ? (
        <Card className="mt-6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-900">
              Recent changes
              {unreadCount > 0 ? (
                <span className="ml-2 rounded bg-warn-50 px-1.5 py-0.5 text-xs text-warn-700">
                  {unreadCount} unread
                </span>
              ) : null}
            </h2>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-signal-600 hover:text-signal-800"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="mt-3 space-y-2 text-sm text-ink-700">
            {events.slice(0, 5).map((ev) => (
              <li key={ev.id} className={ev.readAt ? 'opacity-60' : ''}>
                <span className="font-mono text-xs text-ink-500">{ev.type}</span>
                {' · '}
                {ev.payload?.method} {ev.payload?.pathTemplate || ev.payload?.fieldPath || ''}
                <span className="ml-2 text-xs text-ink-400">
                  {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {topology?.callers?.length > 0 ? (
        <Card className="mt-6 p-4">
          <h2 className="text-sm font-semibold text-ink-900">Callers (topology)</h2>
          <p className="mt-1 text-xs text-ink-500">
            Edges from callers that set <code className="font-mono">API_SENSOR_SERVICE_NAME</code> or{' '}
            <code className="font-mono">X-Service-Name</code>.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {topology.callers.slice(0, 8).map((c) => (
              <li key={c.key} className="flex justify-between gap-3 text-ink-700">
                <span className="font-medium text-ink-900">{c.label}</span>
                <span className="text-ink-500">
                  {c.hitCount} hits · {c.endpoints.length} routes
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {endpoints.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm">
          <label className="flex items-center gap-2 text-ink-700">
            <span className="text-ink-500">Method</span>
            <select
              className={filterControlClass}
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              aria-label="Filter by HTTP method"
            >
              <option value="all">All</option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-ink-700">
            <input
              type="checkbox"
              className="rounded border-ink-300 text-signal-600 focus:ring-signal-600/30"
              checked={hasSensitiveSignals}
              onChange={(e) => setHasSensitiveSignals(e.target.checked)}
            />
            Has sensitive signals
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-ink-700">
            <input
              type="checkbox"
              className="rounded border-ink-300 text-signal-600 focus:ring-signal-600/30"
              checked={noAuthObserved}
              onChange={(e) => setNoAuthObserved(e.target.checked)}
            />
            No auth observed
          </label>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-signal-600 hover:text-signal-800"
            >
              Clear filters
            </button>
          ) : null}
          <p className="ml-auto text-xs text-ink-500">
            Showing {filteredEndpoints.length} of {endpoints.length}
          </p>
        </div>
      ) : null}

      <Card className="mt-8 overflow-hidden">
        {loading && endpoints.length === 0 ? (
          <p className="p-6 text-sm text-ink-600">Loading…</p>
        ) : endpoints.length === 0 ? (
          <EmptyState
            title="Connect middleware"
            description="Install a connector with your service API key. As traffic arrives you’ll see live endpoints, sensitive-field signals, auth modes, and an OpenAPI export."
            action={
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-left text-sm text-ink-600">
                  <p>
                    Collect URL:{' '}
                    <code className="font-mono text-ink-900">{COLLECT_URL}</code>
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
        ) : filteredEndpoints.length === 0 ? (
          <EmptyState
            title="No endpoints match these filters"
            description="Try clearing filters. Sensitive fields and auth gaps show up as traffic accumulates."
            action={
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-ink-700">
              <tr>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Path template</th>
                <th className="px-4 py-3 font-medium">Hits</th>
                <th className="px-4 py-3 font-medium">Auth</th>
                <th className="px-4 py-3 font-medium">Signals</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filteredEndpoints.map((ep) => (
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
                  <td className="px-4 py-3 text-ink-700">{ep.hitCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(ep.authModes) ? ep.authModes : []).length === 0 ? (
                        <span className={`rounded px-1.5 py-0.5 text-xs ${severityClass('low')}`}>
                          none
                        </span>
                      ) : (
                        (Array.isArray(ep.authModes) ? ep.authModes : []).map((m) => (
                          <span
                            key={m}
                            className={`rounded px-1.5 py-0.5 text-xs ${severityClass(m === 'none' ? 'low' : 'medium')}`}
                          >
                            {m}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{signalCount(ep)}</td>
                  <td className="px-4 py-3 text-ink-600">
                    {ep.lastSeenAt ? new Date(ep.lastSeenAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppLayout>
  );
}
