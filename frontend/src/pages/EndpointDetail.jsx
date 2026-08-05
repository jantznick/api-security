import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { inventoryAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import SchemaTree from '../components/SchemaTree';

function severityClass(severity) {
  if (severity === 'high') return 'bg-danger-50 text-danger-700';
  if (severity === 'medium') return 'bg-warn-50 text-warn-700';
  return 'bg-ink-100 text-ink-700';
}

export default function EndpointDetail() {
  const { projectId, endpointId } = useParams();
  const [endpoint, setEndpoint] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await inventoryAPI.getEndpoint(projectId, endpointId);
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
  }, [projectId, endpointId]);

  return (
    <AppLayout>
      <Link
        to={`/projects/${projectId}`}
        className="text-sm text-ink-600 hover:text-ink-900"
      >
        ← Inventory
      </Link>

      {loading ? (
        <p className="mt-6 text-sm text-ink-600">Loading...</p>
      ) : !endpoint ? (
        <p className="mt-6 text-sm text-ink-600">Endpoint not found.</p>
      ) : (
        <>
          <div className="mt-4">
            <h1 className="font-mono text-2xl font-semibold text-ink-900">
              <span className="text-ink-600">{endpoint.method}</span> {endpoint.pathTemplate}
            </h1>
            <p className="mt-2 text-sm text-ink-600">
              {endpoint.hitCount} hits · first{' '}
              {new Date(endpoint.firstSeenAt).toLocaleString()} · last{' '}
              {new Date(endpoint.lastSeenAt).toLocaleString()}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <div>
              <p className="font-medium text-ink-800">Auth modes</p>
              <p className="mt-1 text-ink-600">
                {(Array.isArray(endpoint.authModes) ? endpoint.authModes : []).join(', ') || '—'}
              </p>
            </div>
            <div>
              <p className="font-medium text-ink-800">Status codes</p>
              <p className="mt-1 font-mono text-ink-600">
                {endpoint.statusCodes
                  ? Object.entries(endpoint.statusCodes)
                      .map(([c, n]) => `${c}×${n}`)
                      .join(', ')
                  : '—'}
              </p>
            </div>
            <div>
              <p className="font-medium text-ink-800">Content types</p>
              <p className="mt-1 text-ink-600">
                {(Array.isArray(endpoint.contentTypes) ? endpoint.contentTypes : []).join(', ') ||
                  '—'}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <SchemaTree title="Request schema" schema={endpoint.requestSchema} />
            <SchemaTree title="Response schema" schema={endpoint.responseSchema} />
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-semibold text-ink-900">Signals</h2>
            {(endpoint.signals || []).length === 0 ? (
              <p className="mt-2 text-sm text-ink-600">No signals yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
                {endpoint.signals.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
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
