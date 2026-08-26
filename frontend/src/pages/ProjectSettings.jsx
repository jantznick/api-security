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
import { COLLECT_URL, integratingDocsUrl } from '../lib/urls';

/** Name for the replacement key created during rotate. */
function rotatedKeyName(name) {
  const base = String(name || 'default').trim() || 'default';
  if (/\(rotated\)\s*$/i.test(base)) return base;
  return `${base} (rotated)`;
}

export default function ProjectSettings() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState('default');
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [rotatingId, setRotatingId] = useState(null);
  const [rawKey, setRawKey] = useState(null);
  const [pendingRevokeAfterRotate, setPendingRevokeAfterRotate] = useState(null);

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

  const handleRevoke = async (keyId) => {
    if (!window.confirm('Revoke this API key? Middleware using it will stop reporting.')) {
      return;
    }
    setRevokingId(keyId);
    try {
      await projectsAPI.revokeApiKey(projectId, keyId);
      toast.success('API key revoked');
      if (pendingRevokeAfterRotate === keyId) {
        setPendingRevokeAfterRotate(null);
      }
      await reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRevokingId(null);
    }
  };

  /**
   * Rotate = create replacement key (show raw once), then revoke the old key.
   * Uses existing create + revoke APIs — no dedicated rotate endpoint.
   */
  const handleRotate = async (key) => {
    const confirmed = window.confirm(
      'Rotate this API key?\n\n' +
        '1. A new key is created and shown once — copy it into your middleware.\n' +
        '2. The old key is then revoked so traffic with the old secret stops.',
    );
    if (!confirmed) return;

    setRotatingId(key.id);
    setRawKey(null);
    setPendingRevokeAfterRotate(null);
    try {
      const data = await projectsAPI.createApiKey(projectId, rotatedKeyName(key.name));
      setRawKey(data.rawKey);

      try {
        await projectsAPI.revokeApiKey(projectId, key.id);
        setPendingRevokeAfterRotate(null);
        toast.success('Key rotated — copy the new key; old key is revoked');
      } catch (revokeErr) {
        setPendingRevokeAfterRotate(key.id);
        toast.error(
          revokeErr.message ||
            'New key was created, but the old key could not be revoked. Revoke it manually.',
        );
      }
      await reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRotatingId(null);
    }
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy');
    }
  };

  const installSnippet = `# .env
API_SENSOR_AGENT_URL=${COLLECT_URL}
API_SENSOR_KEY=${rawKey || 'ask_your_key_here'}

# app.js
import express from 'express';
import apiSensor from '@apiglimpse/middleware';

const app = express();
app.use(apiSensor({
  agentUrl: process.env.API_SENSOR_AGENT_URL,
  apiKey: process.env.API_SENSOR_KEY,
}));`;

  const activeKeys = (project?.apiKeys || []).filter((k) => !k.revokedAt);
  const revokedKeys = (project?.apiKeys || []).filter((k) => k.revokedAt);

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
            ? `API keys and install for ${project.name}. New keys are shown once; use Rotate to replace an active key.`
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
              onClick={() => copyText(rawKey, 'API key')}
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
          {pendingRevokeAfterRotate ? (
            <p className="mt-2 text-xs text-warn-700">
              The old key is still active. Use Revoke on that row after you update middleware.
            </p>
          ) : null}
        </div>
      ) : null}

      {!loading && project && !activeKeys.length ? (
        <div
          role="status"
          className="mt-6 rounded-lg border border-warn-700/25 bg-warn-50 px-4 py-3 text-sm text-warn-700"
        >
          <p className="font-medium">No active API keys</p>
          <p className="mt-1">
            Middleware cannot report inventory until you create a key below.
          </p>
        </div>
      ) : null}

      <Card className="mt-8 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Install</h2>
            <p className="mt-1 text-sm text-ink-500">
              Point middleware at the hosted collector. Replace the key after you create one.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="min-h-9 px-3 py-1.5 text-sm"
            onClick={() => copyText(installSnippet, 'Install snippet')}
          >
            Copy snippet
          </Button>
        </div>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-ink-950 p-4 text-xs leading-relaxed text-ink-50">
          <code>{installSnippet}</code>
        </pre>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <p>
            Collector URL:{' '}
            <code className="font-mono text-ink-700">{COLLECT_URL}</code>
            {project?.endpointLimit ? (
              <>
                {' '}
                · Endpoint cap:{' '}
                <span className="text-ink-700">{project.endpointLimit}</span> (billing)
              </>
            ) : (
              <> · Endpoint cap: unlimited</>
            )}
          </p>
          <a
            href={integratingDocsUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-signal-600 hover:text-signal-800"
          >
            Integrating docs →
          </a>
        </div>
      </Card>

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
          <h2 className="text-sm font-semibold text-ink-900">Active keys</h2>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-ink-600">Loading…</p>
        ) : !activeKeys.length ? (
          <EmptyState
            title="No active API keys"
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
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {activeKeys.map((k) => (
                <tr key={k.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink-900">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-ink-600">{k.keyPrefix}…</td>
                  <td className="px-4 py-3 text-ink-600">
                    {k.createdAt ? new Date(k.createdAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => handleRotate(k)}
                        disabled={rotatingId === k.id || revokingId === k.id || creating}
                        className="cursor-pointer text-sm font-medium text-signal-700 hover:text-signal-800 disabled:opacity-50"
                      >
                        {rotatingId === k.id ? 'Rotating…' : 'Rotate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(k.id)}
                        disabled={revokingId === k.id || rotatingId === k.id}
                        className="cursor-pointer text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
                      >
                        {revokingId === k.id ? 'Revoking…' : 'Revoke'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {revokedKeys.length ? (
        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-500">Revoked keys</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Revoked</th>
              </tr>
            </thead>
            <tbody>
              {revokedKeys.map((k) => (
                <tr key={k.id} className="border-b border-ink-100 last:border-0 text-ink-400">
                  <td className="px-4 py-3">{k.name}</td>
                  <td className="px-4 py-3 font-mono">{k.keyPrefix}…</td>
                  <td className="px-4 py-3">
                    {k.revokedAt ? new Date(k.revokedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </AppLayout>
  );
}
