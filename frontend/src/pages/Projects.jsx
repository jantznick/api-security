import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

const VIEW_ALL = 'all';

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

function ServiceRows({ rows, showProjectColumn }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-ink-200 bg-ink-50 text-ink-700">
        <tr>
          <th className="px-4 py-3 font-medium">Service</th>
          {showProjectColumn ? <th className="px-4 py-3 font-medium">Project</th> : null}
          <th className="px-4 py-3 font-medium">Endpoints</th>
          <th className="px-4 py-3 font-medium">API key prefix</th>
          <th className="px-4 py-3 font-medium" />
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id} className="border-b border-ink-100 last:border-0">
            <td className="px-4 py-3 font-medium text-ink-900">{s.name}</td>
            {showProjectColumn ? (
              <td className="px-4 py-3 text-ink-600">{s.projectName}</td>
            ) : null}
            <td className="px-4 py-3 text-ink-700">{s._count?.endpoints ?? 0}</td>
            <td className="px-4 py-3 font-mono text-ink-600">
              {s.apiKeys?.[0]?.keyPrefix || '—'}…
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Link
                  to={`/projects/${s.projectId}/services/${s.id}/settings`}
                  className="font-medium text-ink-500 hover:text-ink-900"
                >
                  Service settings
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
  );
}

export default function Projects() {
  const { activeOrgId, activeOrg } = useActiveOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewService, setShowNewService] = useState(false);
  const [createServiceProjectId, setCreateServiceProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastKey, setLastKey] = useState(null);
  const [lastIds, setLastIds] = useState({ projectId: null, serviceId: null });

  const selectedParam = searchParams.get('project');
  const viewAllServices = selectedParam === VIEW_ALL;

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

  /** Always filter by active org when known (fixes stale list after org switch). */
  const visibleProjects = useMemo(() => {
    if (!activeOrgId) return projects;
    return projects.filter(
      (p) => p.organizationId === activeOrgId || p.organization?.id === activeOrgId,
    );
  }, [projects, activeOrgId]);

  const selectedProjectId = useMemo(() => {
    if (viewAllServices) return null;
    if (selectedParam && visibleProjects.some((p) => p.id === selectedParam)) {
      return selectedParam;
    }
    return null;
  }, [selectedParam, viewAllServices, visibleProjects]);

  const selectedProject = useMemo(
    () => visibleProjects.find((p) => p.id === selectedProjectId) || null,
    [visibleProjects, selectedProjectId],
  );

  /** Drop invalid ?project= when org changes or project disappears. */
  useEffect(() => {
    if (!selectedParam || viewAllServices) return;
    const stillValid = visibleProjects.some((p) => p.id === selectedParam);
    if (!stillValid) {
      setSearchParams({}, { replace: true });
    }
  }, [selectedParam, viewAllServices, visibleProjects, setSearchParams]);

  const targetProjectId =
    selectedProjectId || createServiceProjectId || visibleProjects[0]?.id || '';

  useEffect(() => {
    if (!visibleProjects.length) {
      setCreateServiceProjectId('');
      return;
    }
    const stillValid = visibleProjects.some((p) => p.id === createServiceProjectId);
    if (!stillValid) {
      setCreateServiceProjectId(visibleProjects[0].id);
    }
  }, [visibleProjects, createServiceProjectId]);

  const serviceRows = useMemo(() => {
    const source = viewAllServices
      ? visibleProjects
      : selectedProject
        ? [selectedProject]
        : [];
    const out = [];
    for (const p of source) {
      for (const s of p.services || []) {
        out.push({
          ...s,
          projectId: p.id,
          projectName: p.name,
        });
      }
    }
    return out;
  }, [visibleProjects, viewAllServices, selectedProject]);

  const selectProject = (projectId) => {
    setSearchParams({ project: projectId });
    setShowNewService(false);
  };

  const selectAllServices = () => {
    setSearchParams({ project: VIEW_ALL });
    setShowNewService(false);
  };

  const clearSelection = () => {
    setSearchParams({});
    setShowNewService(false);
  };

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
    if (!targetProjectId) {
      toast.error('Create a project first, then add a service');
      return;
    }
    setCreating(true);
    setLastKey(null);
    setLastIds({ projectId: null, serviceId: null });
    try {
      const data = await projectsAPI.create(trimmed, {
        asService: true,
        organizationId: activeOrgId,
        projectId: targetProjectId,
      });
      setLastKey(data.apiKey);
      setLastIds({
        projectId: data.project?.id || data.service?.projectId || targetProjectId,
        serviceId: data.service?.id || null,
      });
      setName('');
      setShowNewService(false);
      toast.success('Service created — copy the API key now');
      await load();
      if (!viewAllServices) {
        selectProject(targetProjectId);
      }
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
      toast.success('Project created');
      await load();
      if (data.project?.id) {
        selectProject(data.project.id);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingProject(false);
    }
  };

  const orgLabel = activeOrg?.name || 'this organization';
  const showingServices = viewAllServices || Boolean(selectedProject);
  const headerTitle = viewAllServices
    ? 'All services'
    : selectedProject
      ? selectedProject.name
      : 'Projects';
  const headerDescription = viewAllServices
    ? `Every service across projects in ${orgLabel}.`
    : selectedProject
      ? `Services in this project. Organization → Project → Service.`
      : `Projects group related APIs in ${orgLabel}. Open a project to see its services.`;

  return (
    <AppLayout>
      <PageHeader
        breadcrumb={
          showingServices ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
              <button
                type="button"
                onClick={clearSelection}
                className="cursor-pointer hover:text-ink-900"
              >
                Projects
              </button>
              <span aria-hidden>/</span>
              <span className="text-ink-700">
                {viewAllServices ? 'All services' : selectedProject?.name}
              </span>
            </div>
          ) : null
        }
        title={headerTitle}
        description={headerDescription}
        actions={
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            {!showingServices ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={selectAllServices}
                  disabled={visibleProjects.length === 0}
                >
                  View all services
                </Button>
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
              </>
            ) : (
              <>
                {!showNewService ? (
                  <Button
                    type="button"
                    onClick={() => setShowNewService(true)}
                    disabled={!targetProjectId || !activeOrgId}
                  >
                    New service
                  </Button>
                ) : (
                  <form
                    onSubmit={handleCreateService}
                    className="flex flex-wrap items-end gap-2 rounded-lg border border-ink-200 bg-white p-3"
                  >
                    {viewAllServices && visibleProjects.length > 1 ? (
                      <FormField id="target-project" label="Project">
                        <select
                          id="target-project"
                          value={targetProjectId}
                          onChange={(e) => setCreateServiceProjectId(e.target.value)}
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
                        autoFocus
                      />
                    </FormField>
                    <Button type="submit" disabled={creating || !activeOrgId || !targetProjectId}>
                      {creating ? 'Creating…' : 'Create service'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowNewService(false);
                        setName('');
                      }}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                  </form>
                )}
                {selectedProject ? (
                  <div className="flex flex-wrap justify-end gap-3 text-sm">
                    <Link
                      to={`/projects/${selectedProject.id}/topology`}
                      className="font-medium text-ink-500 hover:text-ink-900"
                    >
                      Topology
                    </Link>
                    <Link
                      to={`/projects/${selectedProject.id}/settings`}
                      className="font-medium text-ink-500 hover:text-ink-900"
                    >
                      Project settings
                    </Link>
                  </div>
                ) : null}
              </>
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

      {!showingServices ? (
        <Card className="mt-8 overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-ink-600">Loading…</p>
          ) : visibleProjects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Create a project to group related APIs, then add a service for an API key."
              action={
                <button
                  type="button"
                  onClick={() => setShowNewProject(true)}
                  className="cursor-pointer text-sm font-medium text-signal-600 hover:text-signal-800"
                >
                  + New project
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {visibleProjects.map((p) => {
                const serviceCount = p.services?.length ?? p._count?.services ?? 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => selectProject(p.id)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ink-50"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900">{p.name}</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {serviceCount} {serviceCount === 1 ? 'service' : 'services'}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-ink-500">
                        View services →
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : (
        <Card className="mt-8 overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-ink-600">Loading…</p>
          ) : serviceRows.length === 0 ? (
            <EmptyState
              title="No services yet"
              description={
                viewAllServices
                  ? 'Create a service under a project to get an API key and connect your app.'
                  : `Add a service to “${selectedProject?.name || 'this project'}” to get an API key.`
              }
              action={
                <button
                  type="button"
                  onClick={() => setShowNewService(true)}
                  className="cursor-pointer text-sm font-medium text-signal-600 hover:text-signal-800"
                >
                  + New service
                </button>
              }
            />
          ) : (
            <ServiceRows rows={serviceRows} showProjectColumn={viewAllServices} />
          )}
        </Card>
      )}
    </AppLayout>
  );
}
