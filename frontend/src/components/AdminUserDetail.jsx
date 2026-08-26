import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminAPI } from '../api/api';
import { useConfirm } from '../context/ConfirmContext';
import Button from './Button';

const SYSTEM_ROLES = ['owner', 'admin', 'member', 'viewer'];

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function roleSelectValue(org) {
  if (org.customRoleId) return `custom:${org.customRoleId}`;
  return org.role || org.roleKey || 'member';
}

/**
 * Side panel: user profile, orgs/roles, remove from team, delete account.
 */
export default function AdminUserDetail({
  userId,
  planOptions = [],
  onClose,
  onChanged,
}) {
  const confirm = useConfirm();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await adminAPI.getUser(userId);
      setDetail(data.user);
    } catch (err) {
      toast.error(err.message || 'Failed to load user');
      onClose?.();
    } finally {
      setLoading(false);
    }
  }, [userId, onClose]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRoleChange = async (orgId, next) => {
    setBusy(`role:${orgId}`);
    try {
      const body = next.startsWith('custom:')
        ? { customRoleId: next.slice('custom:'.length) }
        : { role: next };
      const data = await adminAPI.updateUserMembership(userId, orgId, body);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              orgs: (prev.orgs || []).map((o) =>
                o.organizationId === orgId ? data.org : o,
              ),
            }
          : prev,
      );
      toast.success('Role updated');
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Failed to update role');
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveFromOrg = async (org) => {
    if (org.isPersonal) return;
    const ok = await confirm({
      title: 'Remove from organization?',
      message: `Remove ${detail?.email} from “${org.name}”? They will lose access to that org.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(`remove:${org.organizationId}`);
    try {
      await adminAPI.removeUserMembership(userId, org.organizationId);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              orgs: (prev.orgs || []).filter(
                (o) => o.organizationId !== org.organizationId,
              ),
              orgCount: Math.max(0, (prev.orgCount || 1) - 1),
            }
          : prev,
      );
      toast.success('Removed from organization');
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Failed to remove from org');
    } finally {
      setBusy(null);
    }
  };

  const handleAssignPlan = async (planSlug) => {
    setBusy('plan');
    try {
      await adminAPI.assignUserPlan(userId, planSlug);
      setDetail((prev) => (prev ? { ...prev, planSlug } : prev));
      toast.success(`Assigned ${planSlug}`);
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Failed to assign plan');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    const ok = await confirm({
      title: 'Delete user?',
      message: `Permanently delete ${detail.email}? Personal orgs and memberships will be removed. This cannot be undone.`,
      confirmLabel: 'Delete user',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await adminAPI.deleteUser(userId);
      toast.success('User deleted');
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to delete user');
    } finally {
      setBusy(null);
    }
  };

  if (!userId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink-950/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-user-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="flex h-full w-full max-w-lg flex-col border-l border-ink-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="admin-user-title"
              className="font-display text-lg font-bold text-ink-900"
            >
              {loading ? 'Loading…' : detail?.email || 'User'}
            </h2>
            {detail?.displayName ? (
              <p className="mt-0.5 text-sm text-ink-500">{detail.displayName}</p>
            ) : null}
          </div>
          <Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading || !detail ? (
            <p className="text-sm text-ink-500">Loading user…</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-ink-500">Plan</dt>
                  <dd className="mt-1">
                    <select
                      className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-xs"
                      value={detail.planSlug}
                      disabled={busy === 'plan'}
                      onChange={(e) => handleAssignPlan(e.target.value)}
                    >
                      {[...new Set([detail.planSlug, ...planOptions])].filter(Boolean).map((slug) => (
                        <option key={slug} value={slug}>
                          {slug}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Joined</dt>
                  <dd className="mt-1 font-medium text-ink-900">
                    {formatDate(detail.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Stripe customer</dt>
                  <dd className="mt-1 text-ink-900">
                    {detail.hasStripeCustomer ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Subscription</dt>
                  <dd className="mt-1 text-ink-900">
                    {detail.hasSubscription ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Services</dt>
                  <dd className="mt-1 tabular-nums text-ink-900">{detail.serviceCount}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Orgs</dt>
                  <dd className="mt-1 tabular-nums text-ink-900">{detail.orgCount}</dd>
                </div>
              </dl>

              {detail.isPlatformAdmin ? (
                <p className="mt-4 rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
                  This is the platform admin account (ADMIN_EMAIL). It cannot be deleted here.
                </p>
              ) : null}

              <h3 className="mt-8 font-display text-base font-bold text-ink-900">
                Organizations
              </h3>
              <p className="mt-1 text-sm text-ink-500">
                Teams and personal workspace this user belongs to. Change roles or remove them
                from team orgs.
              </p>

              <div className="mt-4 space-y-3">
                {(detail.orgs || []).length === 0 ? (
                  <p className="text-sm text-ink-500">No organization memberships.</p>
                ) : (
                  (detail.orgs || []).map((org) => (
                    <div
                      key={org.organizationId}
                      className="rounded-lg border border-ink-200 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-ink-900">
                            {org.name}
                            {org.isPersonal ? (
                              <span className="ml-2 text-xs font-normal text-ink-400">
                                personal
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-ink-400">{org.slug}</p>
                          <p className="mt-1 text-xs text-ink-500">
                            {org.memberCount != null ? `${org.memberCount} members · ` : ''}
                            {org.projectCount} projects · {org.serviceCount} services
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="text-xs text-ink-500">
                          Role
                          <select
                            className="ml-2 rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-xs text-ink-900"
                            value={roleSelectValue(org)}
                            disabled={busy === `role:${org.organizationId}`}
                            onChange={(e) =>
                              handleRoleChange(org.organizationId, e.target.value)
                            }
                          >
                            {(detail.systemRoles || SYSTEM_ROLES).map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                            {org.customRoleId ? (
                              <option value={`custom:${org.customRoleId}`}>
                                {org.roleName || 'custom'} (custom)
                              </option>
                            ) : null}
                          </select>
                        </label>
                        {!org.isPersonal ? (
                          <Button
                            variant="secondary"
                            className="min-h-8 px-2.5 py-1 text-xs"
                            disabled={busy === `remove:${org.organizationId}`}
                            onClick={() => handleRemoveFromOrg(org)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-10 border-t border-ink-100 pt-6">
                <h3 className="font-display text-base font-bold text-danger-700">
                  Danger zone
                </h3>
                <p className="mt-1 text-sm text-ink-500">
                  Deletes the account and their personal org. Blocked if they are the last owner
                  of a team org.
                </p>
                <Button
                  variant="danger"
                  className="mt-4"
                  disabled={detail.isPlatformAdmin || busy === 'delete'}
                  onClick={handleDelete}
                >
                  {busy === 'delete' ? 'Deleting…' : 'Delete user'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
