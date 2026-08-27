import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authAPI, orgsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import FormField, { inputClassName } from '../components/FormField';
import PageHeader from '../components/PageHeader';
import { useConfirm } from '../context/ConfirmContext';
import { useActiveOrg } from '../hooks/useActiveOrg';
import useAuthStore from '../store/authStore';

export default function OrgSettings() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { setUser } = useAuthStore();
  const { setActiveOrgId, orgs } = useActiveOrg();
  const [organization, setOrganization] = useState(null);
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await orgsAPI.get(orgId);
      setOrganization(data.organization);
      setMe(data.me);
      setName(data.organization?.name || '');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Enter an organization name');
      return;
    }
    setSaving(true);
    try {
      const data = await orgsAPI.update(orgId, { name: trimmed });
      setOrganization((prev) => ({ ...prev, ...data.organization }));
      try {
        const meRes = await authAPI.me();
        setUser(meRes.user);
      } catch {
        /* ignore */
      }
      toast.success('Organization updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!organization || organization.isPersonal) return;
    if (confirmName.trim() !== organization.name) {
      toast.error('Type the organization name to confirm');
      return;
    }
    const ok = await confirm({
      title: 'Delete organization?',
      message:
        'This permanently deletes the organization, its projects, services, keys, and inventory. This cannot be undone.',
      confirmLabel: 'Delete organization',
      variant: 'danger',
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await orgsAPI.delete(orgId, { confirmName: organization.name });
      toast.success('Organization deleted');
      try {
        const meRes = await authAPI.me();
        setUser(meRes.user);
        const personal = (meRes.user?.orgs || []).find((o) => o.isPersonal);
        if (personal) setActiveOrgId(personal.id);
      } catch {
        const fallback = orgs.find((o) => o.isPersonal) || orgs.find((o) => o.id !== orgId);
        if (fallback) setActiveOrgId(fallback.id);
      }
      navigate('/account', { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const canManage = Boolean(me?.canManageSettings);
  const canDelete = Boolean(me?.canDelete);
  const dirty = name.trim() !== (organization?.name || '');

  return (
    <AppLayout>
      <PageHeader
        title="Organization settings"
        description={
          organization
            ? `${organization.name}${organization.isPersonal ? ' · Personal workspace' : ' · Team'}`
            : 'Rename and manage this organization.'
        }
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/orgs/${orgId}/members`}
              className="text-sm font-medium text-signal-600 hover:text-signal-800"
            >
              Team →
            </Link>
            <Link to="/account" className="text-sm font-medium text-ink-500 hover:text-ink-900">
              Account
            </Link>
          </div>
        }
      />

      {loading ? (
        <p className="mt-8 text-sm text-ink-600">Loading…</p>
      ) : (
        <div className="mt-8 space-y-8">
          <Card className="p-6">
            <h2 className="font-display text-lg font-bold text-ink-900">Profile</h2>
            <p className="mt-1 text-sm text-ink-500">
              Slug <code className="font-mono text-ink-700">{organization?.slug}</code>
              {organization?.projectCount != null
                ? ` · ${organization.projectCount} projects`
                : null}
              {organization?.memberCount != null
                ? ` · ${organization.memberCount} members`
                : null}
            </p>
            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <FormField id="org-name" label="Name">
                <input
                  id="org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClassName}
                  maxLength={80}
                  required
                  disabled={!canManage}
                />
              </FormField>
              {canManage ? (
                <Button type="submit" disabled={saving || !dirty}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              ) : (
                <p className="text-sm text-ink-500">
                  You need manage_settings permission to rename this organization.
                </p>
              )}
            </form>
          </Card>

          {canDelete ? (
            <Card className="border-danger-700/20 p-6">
              <h2 className="font-display text-lg font-bold text-danger-700">Danger zone</h2>
              <p className="mt-1 text-sm text-ink-600">
                Delete this team organization and all nested projects and services. Personal
                workspaces cannot be deleted.
              </p>
              <FormField
                id="confirm-delete"
                label={`Type “${organization?.name}” to confirm`}
                className="mt-4"
              >
                <input
                  id="confirm-delete"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  className={inputClassName}
                  placeholder={organization?.name}
                  autoComplete="off"
                />
              </FormField>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="danger"
                  disabled={deleting || confirmName.trim() !== organization?.name}
                  onClick={handleDelete}
                >
                  {deleting ? 'Deleting…' : 'Delete organization'}
                </Button>
              </div>
            </Card>
          ) : organization?.isPersonal ? (
            <Card className="p-6">
              <h2 className="font-display text-lg font-bold text-ink-900">Personal workspace</h2>
              <p className="mt-1 text-sm text-ink-500">
                Your personal workspace is created with your account and cannot be deleted. Create a
                team organization from the switcher if you need a shared workspace.
              </p>
            </Card>
          ) : null}
        </div>
      )}
    </AppLayout>
  );
}
