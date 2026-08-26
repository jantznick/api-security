import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { projectsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import FormField, { inputClassName } from '../components/FormField';
import PageHeader from '../components/PageHeader';
import { COLLECT_URL, integratingDocsUrl } from '../lib/urls';

function KeyBanner({ apiKey, projectId, onDismiss }) {
  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-signal-600/30 bg-signal-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-signal-800">Project created — save these now</p>
          <p className="mt-1 text-xs text-signal-800/80">
            The API key is shown once. Use it with the collect URL in middleware.
          </p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="cursor-pointer text-xs text-signal-800/70 hover:text-signal-800"
          >
            Dismiss
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-signal-800/70">
            API key
          </p>
          <code className="mt-1 block break-all rounded bg-white px-3 py-2 font-mono text-sm text-ink-900">
            {apiKey}
          </code>
          <div className="mt-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-9 px-3 py-1.5 text-sm"
              onClick={() => copyText(apiKey, 'API key')}
            >
              Copy key
            </Button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-signal-800/70">
            Collect URL
          </p>
          <code className="mt-1 block break-all rounded bg-white px-3 py-2 font-mono text-sm text-ink-900">
            {COLLECT_URL}
          </code>
          <div className="mt-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-9 px-3 py-1.5 text-sm"
              onClick={() => copyText(COLLECT_URL, 'Collect URL')}
            >
              Copy collect URL
            </Button>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-signal-800">
        Set <code className="font-mono">API_SENSOR_KEY</code> and{' '}
        <code className="font-mono">API_SENSOR_AGENT_URL</code> in your app.{' '}
        {projectId ? (
          <>
            Full install snippet in{' '}
            <Link
              to={`/projects/${projectId}/settings`}
              className="font-medium underline underline-offset-2"
            >
              project settings
            </Link>
            {' · '}
          </>
        ) : null}
        <a
          href={integratingDocsUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-2"
        >
          Integrating docs
        </a>
        .
      </p>
    </div>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [lastKey, setLastKey] = useState(null);
  const [lastProjectId, setLastProjectId] = useState(null);

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
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Enter a project name');
      return;
    }
    setCreating(true);
    setLastKey(null);
    setLastProjectId(null);
    try {
      const data = await projectsAPI.create(trimmed);
      setLastKey(data.apiKey);
      setLastProjectId(data.project?.id || null);
      setName('');
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
      <PageHeader
        title="Projects"
        description="Each project has an API key for the agent and middleware."
        actions={
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
            <FormField id="project-name" label="Name">
              <input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My API"
                className={`${inputClassName} w-48`}
                required
              />
            </FormField>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'New project'}
            </Button>
          </form>
        }
      />

      {lastKey ? (
        <KeyBanner
          apiKey={lastKey}
          projectId={lastProjectId}
          onDismiss={() => {
            setLastKey(null);
            setLastProjectId(null);
          }}
        />
      ) : null}

      <Card className="mt-8 overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-ink-600">Loading…</p>
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create a project to get an API key, then connect your app so inventory can appear."
            action={
              <a
                href={integratingDocsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-signal-600 hover:text-signal-800"
              >
                Connect guide →
              </a>
            }
          />
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
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <Link
                        to={`/projects/${p.id}/settings`}
                        className="font-medium text-ink-500 hover:text-ink-900"
                      >
                        Settings
                      </Link>
                      <Link
                        to={`/projects/${p.id}`}
                        className="font-medium text-ink-700 hover:text-ink-900"
                      >
                        Inventory →
                      </Link>
                    </div>
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
