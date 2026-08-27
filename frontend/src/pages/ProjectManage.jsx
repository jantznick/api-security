import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { projectsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import FormField, { inputClassName } from '../components/FormField';
import PageHeader from '../components/PageHeader';
import { useConfirm } from '../context/ConfirmContext';

/**
 * Project settings (rename / webhook / delete).
 * Legacy service-UUID bookmarks still redirect to service settings.
 */
export default function ProjectManage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [project, setProject] = useState(null);
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectsAPI.get(projectId);
      if (data.legacy && data.service) {
        navigate(`/projects/${data.service.projectId}/services/${data.service.id}/settings`, {
          replace: true,
        });
        return;
      }
      const p = data.project;
      setProject(p);
      setName(p?.name || '');
      setWebhookUrl(p?.webhookUrl || '');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Enter a project name');
      return;
    }
    setSaving(true);
    try {
      const data = await projectsAPI.update(projectId, {
        name: trimmed,
        webhookUrl: webhookUrl.trim() || null,
      });
      setProject(data.project);
      toast.success('Project updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete project?',
      message: `Delete “${project?.name}” and all of its services, API keys, and inventory? This cannot be undone.`,
      confirmLabel: 'Delete project',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await projectsAPI.delete(projectId);
      toast.success('Project deleted');
      navigate('/projects', { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const dirty =
    name.trim() !== (project?.name || '') ||
    (webhookUrl.trim() || '') !== (project?.webhookUrl || '');

  return (
    <AppLayout>
      <PageHeader
        breadcrumb={
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <Link to="/projects" className="hover:text-ink-900">
              Projects
            </Link>
            <span aria-hidden>/</span>
            <Link
              to={`/projects?project=${projectId}`}
              className="hover:text-ink-900"
            >
              {project?.name || 'Project'}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-ink-700">Project settings</span>
          </div>
        }
        title="Project settings"
        description="Edit this project’s name and drift webhook. Service API keys live under each service’s settings."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={`/projects?project=${projectId}`}>
              <Button variant="secondary">Services</Button>
            </Link>
            <Link to={`/projects/${projectId}/topology`}>
              <Button variant="secondary">Topology</Button>
            </Link>
          </div>
        }
      />

      {loading ? (
        <p className="mt-8 text-sm text-ink-600">Loading…</p>
      ) : !project ? (
        <Card className="mt-8 p-6">
          <p className="text-sm text-ink-700">Project not found.</p>
        </Card>
      ) : (
        <div className="mt-8 space-y-8">
          <Card className="p-6">
            <h2 className="font-display text-lg font-bold text-ink-900">Project metadata</h2>
            <p className="mt-1 text-sm text-ink-500">
              {project.organization?.name ? `${project.organization.name} · ` : ''}
              {project._count?.services ?? project.services?.length ?? 0} services · grouping only
              (not an API connection)
            </p>
            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <FormField id="project-name" label="Project name">
                <input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClassName}
                  maxLength={80}
                  required
                />
              </FormField>
              <FormField
                id="project-webhook"
                label="Project webhook URL (optional)"
                hint="Used for topology drift when a service has no webhook of its own."
              >
                <input
                  id="project-webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className={inputClassName}
                  placeholder="https://hooks.example.com/apiglimpse"
                />
              </FormField>
              <Button type="submit" disabled={saving || !dirty}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </form>
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-bold text-ink-900">Services</h2>
            {(project.services || []).length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No services in this project yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
                {project.services.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <span className="text-sm font-medium text-ink-900">{s.name}</span>
                    <div className="flex gap-3 text-sm">
                      <Link
                        to={`/projects/${projectId}/services/${s.id}`}
                        className="font-medium text-ink-600 hover:text-ink-900"
                      >
                        Inventory
                      </Link>
                      <Link
                        to={`/projects/${projectId}/services/${s.id}/settings`}
                        className="font-medium text-signal-600 hover:text-signal-800"
                      >
                        Settings
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="border-danger-700/20 p-6">
            <h2 className="font-display text-lg font-bold text-danger-700">Danger zone</h2>
            <p className="mt-1 text-sm text-ink-600">
              Deleting a project removes all nested services, API keys, and inventory.
            </p>
            <div className="mt-4">
              <Button type="button" variant="danger" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Deleting…' : 'Delete project'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
