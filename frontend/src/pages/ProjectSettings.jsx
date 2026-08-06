import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { projectsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import FormField, { inputClassName } from '../components/FormField';
import PageHeader from '../components/PageHeader';
import { integratingDocsUrl } from '../lib/urls';

export default function ProjectSettings() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState('default');
  const [creating, setCreating] = useState(false);
  const [rawKey, setRawKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await projectsAPI.get(projectId);
        if (!cancelled) setProject(data.project);
      } catch (err) {
        toast.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const reload = async () => {
    try {
      const data = await projectsAPI.get(projectId);
      setProject(data.project);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateKey = async (event) => {
    event.preventDefault();
    setCreating(true);
    setRawKey(null);
    try {
      const data = await projectsAPI.createApiKey(projectId, keyName.trim() || 'default');
      setRawKey(data.rawKey);
      toast.success('API key created — copy it now');
      setKeyName('default');
      await reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const copyKey = async () => {
    if (!rawKey) return;
    try {
      await navigator.clipboard.writeText(rawKey);
      toast.success('API key copied');
    } catch {
      toast.error('Could not copy');
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
            <Link to={`/projects/${projectId}`} className="hover:text-ink-900">
              {project?.name || 'Inventory'}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-ink-700">Settings</span>
          </div>
        }
        title="Project settings"
        description={
          project
            ? `API keys for ${project.name}. New keys are shown once.`
            : 'API keys for this project.'
        }
      />

      {rawKey ? (
        <div className="mt-6 rounded-lg border border-signal-600/30 bg-signal-50 p-4">
          <p className="text-sm font-medium text-signal-800">New API key (shown once)</p>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-sm text-ink-900">
            {rawKey}
          </code>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              className="min-h-9 px-3 py-1.5 text-sm"
              onClick={copyKey}
            >
              Copy key
            </Button>
            <button
              type="button"
              onClick={() => setRawKey(null)}
              className="cursor-pointer text-sm text-signal-800/70 hover:text-signal-800"
            >
              Dismiss
            </button>
          </div>
          <p className="mt-3 text-xs text-signal-800">
            Set as <code className="font-mono">API_SENSOR_KEY</code>. See the{' '}
            <a
              href={integratingDocsUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-2"
            >
              connect guide
            </a>
            .
          </p>
        </div>
      ) : null}

      <Card className="mt-8 p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Create API key</h2>
        <p className="mt-1 text-sm text-ink-500">
          Use a descriptive name so you know which app or environment uses the key.
        </p>
        <form onSubmit={handleCreateKey} className="mt-4 flex flex-wrap items-end gap-3">
          <FormField id="key-name" label="Key name" className="min-w-[12rem] flex-1">
            <input
              id="key-name"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className={inputClassName}
              placeholder="production"
            />
          </FormField>
          <Button type="submit" disabled={creating || loading}>
            {creating ? 'Creating…' : 'Create key'}
          </Button>
        </form>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-900">Existing keys</h2>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-ink-600">Loading…</p>
        ) : !(project?.apiKeys || []).length ? (
          <EmptyState
            title="No API keys"
            description="Create a key to connect middleware and start discovering endpoints."
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-ink-700">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last used</th>
              </tr>
            </thead>
            <tbody>
              {project.apiKeys.map((k) => (
                <tr key={k.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink-900">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-ink-600">{k.keyPrefix}…</td>
                  <td className="px-4 py-3 text-ink-600">
                    {k.createdAt ? new Date(k.createdAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
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
