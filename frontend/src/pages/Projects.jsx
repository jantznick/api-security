import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { projectsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('Demo project');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [lastKey, setLastKey] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await projectsAPI.list();
      setProjects(data.projects || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    setLastKey(null);
    try {
      const data = await projectsAPI.create(name);
      setLastKey(data.apiKey);
      toast.success('Project created — copy the API key now');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Projects</h1>
          <p className="mt-1 text-sm text-ink-600">
            Each project has an API key for the agent and middleware.
          </p>
        </div>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="project-name" className="mb-1 block text-xs font-medium text-ink-700">
              Name
            </label>
            <input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-ink-300 px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? 'Creating...' : 'New project'}
          </Button>
        </form>
      </div>

      {lastKey && (
        <div className="mt-6 rounded-lg border border-signal-600/30 bg-signal-50 p-4">
          <p className="text-sm font-medium text-signal-800">API key (shown once)</p>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-sm text-ink-900">
            {lastKey}
          </code>
          <p className="mt-2 text-xs text-signal-800">
            Set this as <code>API_SENSOR_KEY</code> in your app. API Glimpse
            validates it on each batch — see the integrating docs.
          </p>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-lg border border-ink-200 bg-white">
        {loading ? (
          <p className="p-6 text-sm text-ink-600">Loading...</p>
        ) : projects.length === 0 ? (
          <p className="p-6 text-sm text-ink-600">No projects yet. Create one to get an API key.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-ink-700">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Endpoints</th>
                <th className="px-4 py-3 font-medium">API key prefix</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink-900">{p.name}</td>
                  <td className="px-4 py-3 text-ink-700">{p._count?.endpoints ?? 0}</td>
                  <td className="px-4 py-3 font-mono text-ink-600">
                    {p.apiKeys?.[0]?.keyPrefix || '—'}…
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/projects/${p.id}`}
                      className="font-medium text-ink-700 hover:text-ink-900"
                    >
                      Open inventory →
                    </Link>
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
