import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { inventoryAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import SchemaTree from '../components/SchemaTree';

function severityClass(severity) {
  if (severity === 'high') return 'bg-danger-50 text-danger-700';
  if (severity === 'medium') return 'bg-warn-50 text-warn-700';
  return 'bg-ink-100 text-ink-700';
}

function MetaBlock({ label, children }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <div className="mt-1 text-sm text-ink-800">{children}</div>
    </div>
  );
}

export default function EndpointDetail() {
  const { projectId, serviceId, endpointId } = useParams();
  const basePath = `/projects/${projectId}/services/${serviceId}`;
  const [endpoint, setEndpoint] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await inventoryAPI.getEndpoint(serviceId, endpointId);
        if (!cancelled) setEndpoint(data.endpoint);
      } catch (err) {
        toast.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, serviceId, endpointId]);

  return (
    <AppLayout>
      <PageHeader
        breadcrumb={
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <Link to="/projects" className="hover:text-ink-900">
              Projects
            </Link>
            <span aria-hidden>/</span>
            <Link to={basePath} className="hover:text-ink-900">
              Inventory
            </Link>
            <span aria-hidden>/</span>
            <span className="text-ink-700">Endpoint</span>
          </div>
        }
        title={
          endpoint ? (
            <>
              <span className="text-ink-500">{endpoint.method}</span> {endpoint.pathTemplate}
            </>
          ) : (
            'Endpoint'
          )
        }
        titleClassName="font-mono font-semibold"
        description={
          endpoint
            ? `${endpoint.hitCount} hits · first ${new Date(endpoint.firstSeenAt).toLocaleString()} · last ${new Date(endpoint.lastSeenAt).toLocaleString()}`
            : undefined
        }
      />

      {loading ? (
        <p className="mt-8 text-sm text-ink-600">Loading…</p>
      ) : !endpoint ? (
        <Card className="mt-8">
          <EmptyState
            title="Endpoint not found"
            description="It may have been removed, or the link is incorrect."
            action={
              <Link
                to={basePath}
                className="text-sm font-medium text-signal-600 hover:text-signal-800"
              >
                ← Back to inventory
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="mt-8 p-5">
            <div className="grid gap-6 sm:grid-cols-3">
              <MetaBlock label="Auth modes">
                {(Array.isArray(endpoint.authModes) ? endpoint.authModes : []).join(', ') ||
                  'None observed'}
              </MetaBlock>
              <MetaBlock label="Status codes">
                <span className="font-mono">
                  {endpoint.statusCodes
                    ? Object.entries(endpoint.statusCodes)
                        .map(([c, n]) => `${c}×${n}`)
                        .join(', ')
                    : '—'}
                </span>
              </MetaBlock>
              <MetaBlock label="Content types">
                {(Array.isArray(endpoint.contentTypes) ? endpoint.contentTypes : []).join(', ') ||
                  '—'}
              </MetaBlock>
            </div>
          </Card>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <SchemaTree title="Request schema" schema={endpoint.requestSchema} />
            <SchemaTree title="Response schema" schema={endpoint.responseSchema} />
          </div>

          <div className="mt-8">
            <h2 className="font-display text-lg font-semibold text-ink-900">Signals</h2>
            <p className="mt-1 text-sm text-ink-500">
              Sensitive or interesting field patterns inferred from traffic shape.
            </p>
            {(endpoint.signals || []).length === 0 ? (
              <Card className="mt-4">
                <EmptyState
                  title="No signals yet"
                  description="As more traffic is observed, sensitive-field signals (email, token, card, and similar) will show up here — then filter for them on inventory."
                />
              </Card>
            ) : (
              <ul className="mt-4 divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 bg-white">
                {endpoint.signals.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span className={`rounded px-1.5 py-0.5 text-xs ${severityClass(s.severity)}`}>
                      {s.severity}
                    </span>
                    <span className="font-medium text-ink-800">{s.category}</span>
                    <span className="font-mono text-ink-600">{s.fieldPath}</span>
                    <span className="text-ink-400">{s.type}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
