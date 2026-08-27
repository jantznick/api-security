import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { projectsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import FormField, { inputClassName } from '../components/FormField';
import PageHeader from '../components/PageHeader';
import {
  ACME_DEMO_PROJECT_ID,
  ACME_DEMO_STOREFRONT_URL,
  ACME_DEMO_WEB_URL,
} from '../lib/urls';

const STATUS_ORDER = ['missing', 'shadow', 'matched', 'stale'];

function statusBadgeClass(status) {
  if (status === 'missing') return 'bg-danger-50 text-danger-700';
  if (status === 'shadow') return 'bg-warn-50 text-warn-700';
  if (status === 'matched') return 'bg-signal-50 text-signal-800';
  return 'bg-ink-100 text-ink-700';
}

function statusEdgeClass(status) {
  if (status === 'missing') return 'border-danger-700/40 bg-danger-50/50';
  if (status === 'shadow') return 'border-warn-700/40 bg-warn-50/50';
  if (status === 'matched') return 'border-signal-600/40 bg-signal-50/50';
  return 'border-ink-200 bg-ink-50';
}

function validateBaselineShape(doc) {
  if (!doc || typeof doc !== 'object') return 'Baseline must be a JSON object';
  if (doc.version !== 1) return 'version must be 1';
  if (!Array.isArray(doc.nodes) || doc.nodes.length === 0) return 'nodes must be a non-empty array';
  if (!Array.isArray(doc.edges)) return 'edges must be an array';
  const nodeIds = new Set();
  for (const node of doc.nodes) {
    if (!node?.id || typeof node.id !== 'string') return 'each node needs a string id';
    nodeIds.add(node.id);
  }
  for (const edge of doc.edges) {
    if (!edge?.from || !edge?.to) return 'each edge needs from and to';
    if (!nodeIds.has(edge.from)) return `edge from unknown node: ${edge.from}`;
    if (!nodeIds.has(edge.to)) return `edge to unknown node: ${edge.to}`;
  }
  if (doc.externalCallers != null) {
    if (!Array.isArray(doc.externalCallers)) return 'externalCallers must be an array';
    for (const caller of doc.externalCallers) {
      if (!caller?.id) return 'each external caller needs an id';
      if (caller.targets) {
        for (const target of caller.targets) {
          if (!nodeIds.has(target)) return `caller targets unknown node: ${target}`;
        }
      }
    }
  }
  return null;
}

function groupByStatus(items, statusKey = 'status') {
  const groups = {};
  for (const status of STATUS_ORDER) groups[status] = [];
  for (const item of items || []) {
    const status = item[statusKey] || 'matched';
    if (!groups[status]) groups[status] = [];
    groups[status].push(item);
  }
  return groups;
}

function TopologyDiagram({ baseline, compare }) {
  const nodes = baseline?.nodes || [];
  const edges = compare?.edges || baseline?.edges || [];

  const nodeById = useMemo(() => {
    const map = new Map();
    for (const node of nodes) map.set(node.id, node);
    for (const edge of edges) {
      if (!map.has(edge.from)) map.set(edge.from, { id: edge.from, label: edge.from });
      if (!map.has(edge.to)) map.set(edge.to, { id: edge.to, label: edge.to });
    }
    return map;
  }, [nodes, edges]);

  const tiers = ['public', 'private', 'internal'];
  const tierColumns = useMemo(() => {
    const columns = tiers.map((tier) => ({
      tier,
      nodes: nodes.filter((n) => (n.tier || 'other') === tier),
    }));
    const other = nodes.filter((n) => !tiers.includes(n.tier || 'other'));
    if (other.length) columns.push({ tier: 'other', nodes: other });
    return columns.filter((c) => c.nodes.length > 0);
  }, [nodes]);

  const edgeStatus = useMemo(() => {
    const map = new Map();
    for (const edge of edges) map.set(`${edge.from}→${edge.to}`, edge.status || 'matched');
    return map;
  }, [edges]);

  if (!nodes.length && !edges.length) {
    return <p className="text-sm text-ink-500">No nodes to display.</p>;
  }

  return (
    <div className="space-y-6">
      {tierColumns.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-start gap-6">
            {tierColumns.map((col) => (
              <div key={col.tier} className="flex w-40 flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{col.tier}</p>
                {col.nodes.map((node) => (
                  <div
                    key={node.id}
                    className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-center text-xs font-medium text-ink-900"
                    title={node.id}
                  >
                    {node.label || node.id}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Edges</p>
        {edges.length === 0 ? (
          <p className="text-sm text-ink-500">No edges in compare result yet.</p>
        ) : (
          edges.map((edge) => {
            const status = edge.status || 'matched';
            const from = nodeById.get(edge.from)?.label || edge.from;
            const to = nodeById.get(edge.to)?.label || edge.to;
            return (
              <div
                key={`${edge.from}-${edge.to}-${status}`}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${statusEdgeClass(status)}`}
              >
                <span className="font-medium text-ink-900">{from}</span>
                <span className="font-mono text-ink-500">→</span>
                <span className="font-medium text-ink-900">{to}</span>
                <span
                  className={`ml-auto rounded px-1.5 py-0.5 text-xs font-medium uppercase ${statusBadgeClass(status)}`}
                >
                  {status}
                </span>
                {edge.observedHitCount != null ? (
                  <span className="text-xs text-ink-500">{edge.observedHitCount} hits</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {baseline?.externalCallers?.length > 0 ? (
        <pre className="overflow-x-auto rounded-lg border border-ink-200 bg-ink-50 p-3 font-mono text-xs text-ink-700">
          {baseline.externalCallers.map((caller) => {
            const targets = caller.targets?.length
              ? caller.targets
              : nodes.filter((n) => n.tier === 'public').map((n) => n.id);
            return targets
              .map((target) => {
                const status =
                  compare?.externalCallers?.find(
                    (c) => c.callerId === caller.id && c.to === target,
                  )?.status || edgeStatus.get(`${caller.id}→${target}`) || '?';
                const mark = status === 'missing' ? '✗' : status === 'shadow' ? '?' : status === 'matched' ? '✓' : '·';
                return `${mark} ${caller.label || caller.id} ──→ ${nodeById.get(target)?.label || target}`;
              })
              .join('\n');
          }).join('\n')}
        </pre>
      ) : null}
    </div>
  );
}

function EdgeList({ title, edges }) {
  const groups = groupByStatus(edges);
  const hasAny = edges?.length > 0;

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-ink-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      </div>
      {!hasAny ? (
        <p className="p-4 text-sm text-ink-500">No service-to-service edges in compare result.</p>
      ) : (
        <div className="divide-y divide-ink-100">
          {STATUS_ORDER.filter((s) => groups[s]?.length).map((status) => (
            <div key={status} className="p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-500">
                <span className={`rounded px-1.5 py-0.5 ${statusBadgeClass(status)}`}>{status}</span>
                <span>{groups[status].length}</span>
              </p>
              <ul className="space-y-2 text-sm">
                {groups[status].map((edge) => (
                  <li
                    key={`${edge.from}-${edge.to}-${edge.baselineEdgeId || ''}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-ink-700"
                  >
                    <span>
                      <span className="font-medium text-ink-900">{edge.from}</span>
                      <span className="mx-1 text-ink-400">→</span>
                      <span className="font-medium text-ink-900">{edge.to}</span>
                    </span>
                    <span className="text-xs text-ink-500">
                      {edge.observedHitCount != null ? `${edge.observedHitCount} hits` : null}
                      {edge.samples?.[0]
                        ? ` · ${edge.samples[0].method} ${edge.samples[0].pathTemplate}`
                        : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ExternalCallerList({ callers }) {
  const groups = groupByStatus(callers);
  const hasAny = callers?.length > 0;

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-ink-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-900">External callers</h2>
      </div>
      {!hasAny ? (
        <p className="p-4 text-sm text-ink-500">No external caller edges in compare result.</p>
      ) : (
        <div className="divide-y divide-ink-100">
          {STATUS_ORDER.filter((s) => groups[s]?.length).map((status) => (
            <div key={status} className="p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-500">
                <span className={`rounded px-1.5 py-0.5 ${statusBadgeClass(status)}`}>{status}</span>
                <span>{groups[status].length}</span>
              </p>
              <ul className="space-y-2 text-sm">
                {groups[status].map((caller) => (
                  <li
                    key={`${caller.callerId}-${caller.to}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-ink-700"
                  >
                    <span>
                      <span className="font-medium text-ink-900">{caller.callerId}</span>
                      <span className="mx-1 text-ink-400">→</span>
                      <span className="font-medium text-ink-900">{caller.to}</span>
                    </span>
                    {caller.observedHitCount != null ? (
                      <span className="text-xs text-ink-500">{caller.observedHitCount} hits</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ProjectTopology() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [observed, setObserved] = useState(null);
  const [compare, setCompare] = useState(null);
  const [events, setEvents] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploadText, setUploadText] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [projectRes, baselineRes, observedRes] = await Promise.all([
        projectsAPI.get(projectId),
        projectsAPI.getTopologyBaseline(projectId).catch(() => ({ baseline: null })),
        projectsAPI.getTopologyObserved(projectId).catch(() => null),
      ]);
      setProject(projectRes.project || projectRes.service?.project || null);
      const currentBaseline = baselineRes?.baseline ?? baselineRes ?? null;
      setBaseline(currentBaseline);
      setObserved(observedRes);

      if (currentBaseline) {
        const [compareRes, eventsRes] = await Promise.all([
          projectsAPI.getTopologyCompare(projectId, { recordDrift: true }).catch(() => null),
          projectsAPI.getTopologyEvents(projectId, { limit: 20 }).catch(() => ({
            events: [],
            unreadCount: 0,
          })),
        ]);
        setCompare(compareRes?.compare ?? compareRes ?? null);
        setEvents(eventsRes?.events || []);
        setUnreadCount(eventsRes?.unreadCount || 0);
      } else {
        setCompare(null);
        setEvents([]);
        setUnreadCount(0);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = compare?.summary;

  const handleValidate = () => {
    setUploadError(null);
    try {
      const doc = JSON.parse(uploadText);
      const err = validateBaselineShape(doc);
      if (err) {
        setUploadError(err);
        toast.error(err);
        return;
      }
      toast.success('Baseline JSON is valid');
    } catch {
      const msg = 'Invalid JSON — check syntax';
      setUploadError(msg);
      toast.error(msg);
    }
  };

  const handleUpload = async () => {
    setUploadError(null);
    let doc;
    try {
      doc = JSON.parse(uploadText);
    } catch {
      const msg = 'Invalid JSON — check syntax';
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    const err = validateBaselineShape(doc);
    if (err) {
      setUploadError(err);
      toast.error(err);
      return;
    }

    setUploading(true);
    try {
      await projectsAPI.putTopologyBaseline(projectId, doc);
      toast.success('Baseline uploaded');
      setUploadText('');
      await load();
    } catch (uploadErr) {
      setUploadError(uploadErr.message);
      toast.error(uploadErr.message);
    } finally {
      setUploading(false);
    }
  };

  const markAllRead = async () => {
    try {
      await projectsAPI.markTopologyEventsRead(projectId);
      toast.success('Topology events marked read');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const projectName = project?.name || 'Project';
  const firstService = project?.services?.[0];
  const showAcmeDemoLinks =
    ACME_DEMO_STOREFRONT_URL &&
    (!ACME_DEMO_PROJECT_ID || ACME_DEMO_PROJECT_ID === projectId);

  return (
    <AppLayout>
      <PageHeader
        breadcrumb={
          <Link to="/projects" className="text-sm text-ink-500 hover:text-ink-900">
            ← Projects
          </Link>
        }
        title={`${projectName} — Topology`}
        description="Compare documented architecture against live traffic across all services in this project."
        actions={
          <>
            {firstService ? (
              <Link to={`/projects/${projectId}/services/${firstService.id}`}>
                <Button variant="secondary">Inventory</Button>
              </Link>
            ) : null}
            <Button variant="secondary" onClick={load} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh compare'}
            </Button>
          </>
        }
      />

      {showAcmeDemoLinks ? (
        <Card className="mt-6 border-signal-600/20 bg-signal-50/40 p-4">
          <h2 className="text-sm font-semibold text-ink-900">Acme live demo</h2>
          <p className="mt-1 text-xs text-ink-600">
            Hosted stack on Railway. Run traffic against storefront-api, then refresh compare above.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <a
                href={ACME_DEMO_STOREFRONT_URL}
                target="_blank"
                rel="noreferrer"
                className="text-signal-700 underline hover:text-signal-900"
              >
                storefront-api
              </a>
              <span className="text-ink-500"> — traffic target</span>
            </li>
            {ACME_DEMO_WEB_URL ? (
              <li>
                <a
                  href={ACME_DEMO_WEB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-signal-700 underline hover:text-signal-900"
                >
                  web-storefront
                </a>
                <span className="text-ink-500"> — browser UI</span>
              </li>
            ) : null}
          </ul>
          <p className="mt-3 font-mono text-xs text-ink-500">
            node demo/acme/traffic.mjs --profile full --once
          </p>
        </Card>
      ) : null}

      <Card className="mt-8 p-4">
        <h2 className="text-sm font-semibold text-ink-900">Upload baseline</h2>
        <p className="mt-1 text-xs text-ink-500">
          Paste <code className="font-mono">topology-baseline.v1.json</code>. Node ids must match{' '}
          <code className="font-mono">API_SENSOR_SERVICE_NAME</code> on instrumented services.
        </p>
        <FormField id="baseline-json" label="Baseline JSON" className="mt-4">
          <textarea
            id="baseline-json"
            rows={12}
            value={uploadText}
            onChange={(e) => {
              setUploadText(e.target.value);
              setUploadError(null);
            }}
            placeholder='{"version":1,"nodes":[...],"edges":[...]}'
            className={`${inputClassName} font-mono text-xs`}
          />
        </FormField>
        {uploadError ? <p className="mt-2 text-sm text-danger-700">{uploadError}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleValidate} disabled={!uploadText.trim()}>
            Validate
          </Button>
          <Button onClick={handleUpload} disabled={uploading || !uploadText.trim()}>
            {uploading ? 'Uploading…' : 'Upload baseline'}
          </Button>
        </div>
      </Card>

      {loading ? (
        <p className="mt-8 text-sm text-ink-600">Loading…</p>
      ) : (
        <>
          <Card className="mt-6 p-4">
            <h2 className="text-sm font-semibold text-ink-900">Observed traffic</h2>
            <p className="mt-1 text-xs text-ink-500">
              Live caller → service edges from ingest (no baseline required).
              {observed?.generatedAt
                ? ` Generated ${new Date(observed.generatedAt).toLocaleString()}.`
                : ''}
            </p>
            {!observed ||
            (!(observed.nodes || []).length &&
              !(observed.edges || []).length &&
              !(observed.externalCallers || []).length) ? (
              <p className="mt-4 text-sm text-ink-500">
                No traffic edges yet. Send requests through instrumented services to populate this
                graph.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {(observed.nodes || []).length > 0 ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                      Services ({observed.nodes.length})
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {observed.nodes.map((n) => (
                        <li
                          key={n.id}
                          className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-800"
                        >
                          {n.label || n.id}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <EdgeList
                  title="Observed service edges"
                  edges={(observed.edges || []).map((e) => ({
                    ...e,
                    status: 'matched',
                    observedHitCount: e.hitCount,
                  }))}
                />
                <ExternalCallerList
                  callers={(observed.externalCallers || []).map((c) => ({
                    ...c,
                    status: 'matched',
                    observedHitCount: c.hitCount,
                  }))}
                />
              </div>
            )}
          </Card>

          {!baseline ? (
            <Card className="mt-6">
              <EmptyState
                title="No baseline yet"
                description="Upload a topology baseline JSON to compare documented architecture against observed traffic. For the Acme sales demo, use demo/acme/baseline-topology.json from the repo."
              />
            </Card>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-ink-900">Matched</span>{' '}
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusBadgeClass('matched')}`}
                  >
                    {summary?.matched ?? 0}
                  </span>
                </span>
                <span className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-ink-900">Missing</span>{' '}
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusBadgeClass('missing')}`}
                  >
                    {summary?.missing ?? 0}
                  </span>
                </span>
                <span className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-ink-900">Shadow</span>{' '}
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusBadgeClass('shadow')}`}
                  >
                    {summary?.shadow ?? 0}
                  </span>
                </span>
                {(summary?.externalMatched != null || summary?.externalShadow != null) && (
                  <span className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-600">
                    External: {summary?.externalMatched ?? 0} matched ·{' '}
                    {summary?.externalShadow ?? 0} shadow
                  </span>
                )}
                {compare?.comparedAt ? (
                  <span className="self-center text-xs text-ink-400">
                    Compared {new Date(compare.comparedAt).toLocaleString()}
                  </span>
                ) : null}
              </div>

              <Card className="mt-6 p-4">
                <h2 className="text-sm font-semibold text-ink-900">Architecture diagram</h2>
                <p className="mt-1 text-xs text-ink-500">
                  Service tiers from baseline; edge colors reflect compare status (green matched, red
                  missing, amber shadow).
                </p>
                <div className="mt-4">
                  <TopologyDiagram baseline={baseline} compare={compare} />
                </div>
              </Card>

              <EdgeList title="Service edges (compare)" edges={compare?.edges || []} />
              <ExternalCallerList callers={compare?.externalCallers || []} />

              {events.length > 0 ? (
                <Card className="mt-6 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-ink-900">
                      Drift events
                      {unreadCount > 0 ? (
                        <span className="ml-2 rounded-full bg-warn-50 px-2 py-0.5 text-xs font-medium text-warn-700">
                          {unreadCount} unread
                        </span>
                      ) : null}
                    </h2>
                    {unreadCount > 0 ? (
                      <Button
                        variant="secondary"
                        className="min-h-9 px-3 py-1.5 text-sm"
                        onClick={markAllRead}
                      >
                        Mark all read
                      </Button>
                    ) : null}
                  </div>
                  <ul className="divide-y divide-ink-100 text-sm">
                    {events.map((ev) => (
                      <li key={ev.id} className="px-4 py-3 text-ink-700">
                        <span className="font-medium text-ink-900">{ev.type}</span>
                        {ev.payload?.message ? ` — ${ev.payload.message}` : null}
                        {!ev.payload?.message && ev.payload?.from && ev.payload?.to
                          ? ` — ${ev.payload.from} → ${ev.payload.to}`
                          : null}
                        <span className="ml-2 text-xs text-ink-400">
                          {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </>
          )}
        </>
      )}
    </AppLayout>
  );
}
