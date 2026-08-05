import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { inventoryAPI, projectsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';

function severityClass(severity) {
  if (severity === 'high') return 'bg-danger-50 text-danger-700';
  if (severity === 'medium') return 'bg-warn-50 text-warn-700';
  return 'bg-ink-100 text-ink-700';
}

export default function Inventory() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, e] = await Promise.all([
        projectsAPI.get(projectId),
        inventoryAPI.listEndpoints(projectId),
      ]);
      setProject(p.project);
      setEndpoints(e.endpoints || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/projects" className="text-sm text-ink-600 hover:text-ink-900">
            ← Projects
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-ink-900">
            {project?.name || 'Inventory'}
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Discovered endpoints (auto-refresh every 5s). Schemas and signals only — no raw bodies.
          </p>
        </div>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-ink-200 bg-white">
        {loading && endpoints.length === 0 ? (
          <p className="p-6 text-sm text-ink-600">Loading...</p>
        ) : endpoints.length === 0 ? (
          <p className="p-6 text-sm text-ink-600">
            No endpoints yet. Hit the demo app routes with the sensor configured, then wait a few
            seconds.
          </p>
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
              {endpoints.map((ep) => (
                <tr key={ep.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/80">
                  <td className="px-4 py-3">
                    <Link
                      to={`/projects/${projectId}/endpoints/${ep.id}`}
                      className="font-mono font-semibold text-ink-800"
                    >
                      {ep.method}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/projects/${projectId}/endpoints/${ep.id}`}
                      className="font-mono text-ink-900 hover:underline"
                    >
                      {ep.pathTemplate}
                    </Link>
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
