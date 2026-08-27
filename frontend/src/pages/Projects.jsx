import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { projectsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import FormField, { inputClassName } from '../components/FormField';
import PageHeader from '../components/PageHeader';
import { useActiveOrg } from '../hooks/useActiveOrg';
import { COLLECT_URL, integratingDocsUrl } from '../lib/urls';

function KeyBanner({ apiKey, projectId, serviceId, onDismiss }) {
  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy');
    }
  };

  const settingsPath =
    projectId && serviceId
      ? `/projects/${projectId}/services/${serviceId}/settings`
      : null;

  return (
    <div className="mt-6 rounded-lg border border-signal-600/30 bg-signal-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-signal-800">Service created — save these now</p>
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
        {settingsPath ? (
          <>
            Full install snippet in{' '}
            <Link to={settingsPath} className="font-medium underline underline-offset-2">
              service settings
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
  const { activeOrgId, activeOrg, orgs } = useActiveOrg();
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [targetProjectId, setTargetProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [lastKey, setLastKey] = useState(null);
  const [lastIds, setLastIds] = useState({ projectId: null, serviceId: null });

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

  /** API returns all membership orgs; filter client-side by active org when set. */
  const visibleProjects = useMemo(() => {
    if (!activeOrgId || orgs.length <= 1) return projects;
    return projects.filter(
      (p) => p.organizationId === activeOrgId || p.organization?.id === activeOrgId,
    );
  }, [projects, activeOrgId, orgs.length]);

  useEffect(() => {
    if (!visibleProjects.length) {
      setTargetProjectId('');
      return;
    }
    const stillValid = visibleProjects.some((p) => p.id === targetProjectId);
    if (!stillValid) {
      const preferred =
        visibleProjects.find((p) => p.name === 'Default') || visibleProjects[0];
      setTargetProjectId(preferred.id);
    }
  }, [visibleProjects, targetProjectId]);

  /** Flatten services for list UX. */
  const rows = useMemo(() => {
    const out = [];
    for (const p of visibleProjects) {
      for (const s of p.services || []) {
        out.push({
          ...s,
          projectId: p.id,
          projectName: p.name,
        });
      }
    }
    return out;
  }, [visibleProjects]);

  const handleCreateService = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Enter a service name');
      return;
    }
    if (!activeOrgId) {
      toast.error('Select an organization first');
      return;
    }
    setCreating(true);
    setLastKey(null);
    setLastIds({ projectId: null, serviceId: null });
    try {
      const data = await projectsAPI.create(trimmed, {
        asService: true,
        organizationId: activeOrgId,
        ...(targetProjectId ? { projectId: targetProjectId } : {}),
      });
      setLastKey(data.apiKey);
      setLastIds({
        projectId: data.project?.id || data.service?.projectId || null,
        serviceId: data.service?.id || null,
      });
      setName('');
      toast.success('Service created — copy the API key now');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateProject = async (event) => {
    event.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed) {
      toast.error('Enter a project name');
      return;
    }
    if (!activeOrgId) {
      toast.error('Select an organization first');
      return;
    }
    setCreatingProject(true);
    try {
      const data = await projectsAPI.create(trimmed, {
        asService: false,
        organizationId: activeOrgId,
      });
      setProjectName('');
      setShowNewProject(false);
      if (data.project?.id) {
        setTargetProjectId(data.project.id);
      }
      toast.success('Project created');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingProject(false);
    }
  };

  const orgLabel = activeOrg?.name || 'this organization';

  return (
    <AppLayout>
      <PageHeader
        title="Projects"
        description={`Services are the APIs you connect. They live under projects in ${orgLabel}.`}
        actions={
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <form onSubmit={handleCreateService} className="flex flex-wrap items-end gap-2">
              {visibleProjects.length > 1 ? (
                <FormField id="target-project" label="Project">
                  <select
                    id="target-project"
                    value={targetProjectId}
                    onChange={(e) => setTargetProjectId(e.target.value)}
                    className={`${inputClassName} w-40`}
                  >
                    {visibleProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              ) : null}
              <FormField id="service-name" label="Service name">
                <input
                  id="service-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My API"
                  className={`${inputClassName} w-48`}
                  required
                />
              </FormField>
              <Button type="submit" disabled={creating || !activeOrgId}>
                {creating ? 'Creating…' : 'New service'}
              </Button>
            </form>
            {!showNewProject ? (
              <button
                type="button"
                onClick={() => setShowNewProject(true)}
                className="cursor-pointer self-end text-sm font-medium text-signal-600 hover:text-signal-800"
              >
                + New project
              </button>
            ) : (
              <form
                onSubmit={handleCreateProject}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-ink-200 bg-white p-3"
              >
                <FormField id="project-name" label="Project name">
                  <input
                    id="project-name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Payments"
                    className={`${inputClassName} w-48`}
                    required
                    autoFocus
                  />
                </FormField>
                <Button type="submit" disabled={creatingProject || !activeOrgId}>
                  {creatingProject ? 'Creating…' : 'Create project'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowNewProject(false);
                    setProjectName('');
                  }}
                  disabled={creatingProject}
                >
                  Cancel
                </Button>
              </form>
            )}
          </div>
        }
      />

      {lastKey ? (
        <KeyBanner
          apiKey={lastKey}
          projectId={lastIds.projectId}
          serviceId={lastIds.serviceId}
          onDismiss={() => {
            setLastKey(null);
            setLastIds({ projectId: null, serviceId: null });
          }}
        />
      ) : null}

      <Card className="mt-8 overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-ink-600">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title={visibleProjects.length === 0 ? 'No projects yet' : 'No services yet'}
            description={
              visibleProjects.length === 0
                ? 'Create a project to group related APIs, then add a service for an API key.'
                : 'Create a service to get an API key, then connect your app so inventory can appear.'
            }
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
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Endpoints</th>
                <th className="px-4 py-3 font-medium">API key prefix</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink-900">{s.name}</td>
                  <td className="px-4 py-3 text-ink-600">{s.projectName}</td>
                  <td className="px-4 py-3 text-ink-700">{s._count?.endpoints ?? 0}</td>
                  <td className="px-4 py-3 font-mono text-ink-600">
                    {s.apiKeys?.[0]?.keyPrefix || '—'}…
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <Link
                        to={`/projects/${s.projectId}/settings`}
                        className="font-medium text-ink-500 hover:text-ink-900"
                      >
                        Project
                      </Link>
                      <Link
                        to={`/projects/${s.projectId}/topology`}
                        className="font-medium text-ink-500 hover:text-ink-900"
                      >
                        Topology
                      </Link>
                      <Link
                        to={`/projects/${s.projectId}/services/${s.id}/settings`}
                        className="font-medium text-ink-500 hover:text-ink-900"
                      >
                        Settings
                      </Link>
                      <Link
                        to={`/projects/${s.projectId}/services/${s.id}`}
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
