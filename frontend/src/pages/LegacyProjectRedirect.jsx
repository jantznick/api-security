import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { projectsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Card from '../components/Card';

/**
 * Old bookmarks used /projects/:id where :id was today's Service UUID.
 * After S2, resolve as service (legacy) or project home (list services).
 */
export default function LegacyProjectRedirect() {
  const { projectId, endpointId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await projectsAPI.get(projectId);
        if (cancelled) return;

        const wantsSettings = location.pathname.endsWith('/settings');
        const wantsEndpoint = Boolean(endpointId);

        if (data.legacy && data.service) {
          const base = `/projects/${data.service.projectId}/services/${data.service.id}`;
          if (wantsSettings) {
            navigate(`${base}/settings`, { replace: true });
          } else if (wantsEndpoint) {
            navigate(`${base}/endpoints/${endpointId}`, { replace: true });
          } else {
            navigate(base, { replace: true });
          }
          return;
        }

        const p = data.project;
        if (p?.services?.length === 1 && !wantsSettings && !wantsEndpoint) {
          navigate(`/projects/${p.id}/services/${p.services[0].id}`, { replace: true });
          return;
        }
        setProject(p);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Not found');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, endpointId, location.pathname, navigate]);

  if (error) {
    return (
      <AppLayout>
        <Card className="mt-8">
          <p className="text-sm text-ink-700">{error}</p>
          <Link to="/projects" className="mt-4 inline-block text-sm font-medium text-signal-600">
            ← Projects
          </Link>
        </Card>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <p className="mt-8 text-sm text-ink-600">Loading…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold text-ink-900">{project.name}</h1>
      <p className="mt-1 text-sm text-ink-600">Services in this project</p>
      <Card className="mt-6 overflow-hidden">
        {(project.services || []).length === 0 ? (
          <p className="p-6 text-sm text-ink-600">No services yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {project.services.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium text-ink-900">{s.name}</span>
                <Link
                  to={`/projects/${project.id}/services/${s.id}`}
                  className="text-sm font-medium text-ink-700 hover:text-ink-900"
                >
                  Inventory →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Link to="/projects" className="mt-4 inline-block text-sm text-ink-500 hover:text-ink-900">
        ← All projects
      </Link>
    </AppLayout>
  );
}
