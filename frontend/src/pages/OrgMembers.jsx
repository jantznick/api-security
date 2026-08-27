import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { orgsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import FormField, { inputClassName } from '../components/FormField';
import PageHeader from '../components/PageHeader';
import useAuthStore from '../store/authStore';
import { useConfirm } from '../context/ConfirmContext';

const SYSTEM_ASSIGNABLE = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

function roleDisplay(entity) {
  return entity?.roleName || entity?.roleKey || entity?.role || '—';
}

function memberRoleRef(m) {
  return m?.roleRef || (m?.customRoleId ? `custom:${m.customRoleId}` : m?.role);
}

function seatsLabel(seats) {
  if (!seats) return null;
  const used = seats.reserved ?? seats.used;
  if (seats.limit == null) return `${used} seats used (unlimited)`;
  return `${used} / ${seats.limit} seats`;
}

function RoleEditor({
  permissionsCatalog,
  initial,
  saving,
  onSave,
  onCancel,
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [selected, setSelected] = useState(() => new Set(initial?.permissions || []));

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <form
      className="space-y-4 border-t border-ink-100 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: name.trim(),
          description: description.trim() || null,
          permissions: [...selected],
        });
      }}
    >
      <FormField id="role-name" label="Role name">
        <input
          id="role-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClassName}
          placeholder="e.g. Security analyst"
          required
          maxLength={80}
        />
      </FormField>
      <FormField id="role-desc" label="Description (optional)">
        <input
          id="role-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClassName}
          placeholder="What this role can do"
          maxLength={280}
        />
      </FormField>
      <fieldset>
        <legend className="text-sm font-medium text-ink-800">Permissions</legend>
        <ul className="mt-2 space-y-2">
          {(permissionsCatalog || []).map((p) => (
            <li key={p.key}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.has(p.key)}
                  onChange={() => toggle(p.key)}
                />
                <span>
                  <span className="font-medium">{p.key}</span>
                  <span className="block text-ink-500">{p.label}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : initial?.id ? 'Save role' : 'Create role'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function OrgMembers() {
  const { orgId } = useParams();
  const { user } = useAuthStore();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [seats, setSeats] = useState(null);
  const [me, setMe] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState([]);
  const [email, setEmail] = useState('');
  const [inviteRoleRef, setInviteRoleRef] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState(null);
  const [editingRole, setEditingRole] = useState(null); // null | 'new' | role object
  const [savingRole, setSavingRole] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [membersData, invitesData, rolesData] = await Promise.all([
        orgsAPI.listMembers(orgId),
        orgsAPI.listInvites(orgId),
        orgsAPI.listRoles(orgId),
      ]);
      setOrganization(membersData.organization);
      setMembers(membersData.members || []);
      setSeats(membersData.seats || null);
      setMe(membersData.me || null);
      setInvites(invitesData.invites || []);
      setRoles(rolesData.roles || []);
      setPermissionsCatalog(rolesData.permissions || []);
    } catch (err) {
      toast.error(err?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const manage = Boolean(me?.canManageMembers);
  const manageRoles = Boolean(me?.canManageRoles);
  const meIsOwner = me?.role === 'owner' && !me?.customRoleId;

  const assignableOptions = useMemo(() => {
    const custom = (roles || [])
      .filter((r) => !r.isSystem)
      .map((r) => ({ value: `custom:${r.id}`, label: r.name }));
    const system = SYSTEM_ASSIGNABLE.filter((opt) => (meIsOwner ? true : opt.value !== 'admin'));
    return [...system, ...custom];
  }, [roles, meIsOwner]);

  const handleInvite = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Enter an email');
      return;
    }
    setInviting(true);
    setLastInviteUrl(null);
    try {
      const body = inviteRoleRef.startsWith('custom:')
        ? { email: trimmed, customRoleId: inviteRoleRef.slice('custom:'.length) }
        : { email: trimmed, role: inviteRoleRef };
      const data = await orgsAPI.createInvite(orgId, body);
      if (data.inviteUrl) {
        setLastInviteUrl(data.inviteUrl);
        toast.success(
          data.emailSent
            ? 'Invite sent — link also shown below'
            : 'Invite created — copy the link below (email not configured)',
        );
      } else {
        toast.success(data.emailSent ? 'Invite email sent' : 'Invite created');
      }
      setEmail('');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not create invite');
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (inviteId) => {
    try {
      await orgsAPI.revokeInvite(orgId, inviteId);
      toast.success('Invite revoked');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not revoke invite');
    }
  };

  const handleRemove = async (userId, label) => {
    const ok = await confirm({
      title: 'Remove member?',
      message: `Remove ${label} from this organization? They will lose access immediately.`,
      confirmLabel: 'Remove member',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await orgsAPI.removeMember(orgId, userId);
      toast.success('Member removed');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not remove member');
    }
  };

  const handleRoleChange = async (userId, nextRef) => {
    try {
      const body = nextRef.startsWith('custom:')
        ? { customRoleId: nextRef.slice('custom:'.length) }
        : { role: nextRef };
      await orgsAPI.updateMember(orgId, userId, body);
      toast.success('Role updated');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not update role');
    }
  };

  const handleSaveRole = async (payload) => {
    setSavingRole(true);
    try {
      if (editingRole && editingRole !== 'new' && editingRole.id) {
        await orgsAPI.updateRole(orgId, editingRole.id, payload);
        toast.success('Role updated');
      } else {
        await orgsAPI.createRole(orgId, payload);
        toast.success('Role created');
      }
      setEditingRole(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save role');
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (role) => {
    const ok = await confirm({
      title: 'Delete role?',
      message: `Delete role “${role.name}”? Members must be reassigned first.`,
      confirmLabel: 'Delete role',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await orgsAPI.deleteRole(orgId, role.id);
      toast.success('Role deleted');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete role');
    }
  };

  const title = organization?.name || 'Organization';
  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  return (
    <AppLayout>
      <PageHeader
        title="Team"
        description={`${title} — members, invites, and custom roles.`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/orgs/${orgId}/settings`}
              className="text-sm font-medium text-signal-600 hover:text-signal-800"
            >
              Org settings
            </Link>
            <Link
              to="/account"
              className="text-sm font-medium text-ink-500 hover:text-ink-900"
            >
              ← Account
            </Link>
          </div>
        }
      />

      {loading ? (
        <p className="mt-8 text-sm text-ink-600">Loading…</p>
      ) : (
        <div className="mt-8 space-y-8">
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>
                <p className="mt-1 text-sm text-ink-500">
                  {organization?.isPersonal ? 'Personal workspace' : 'Team organization'}
                  {seatsLabel(seats) ? ` · ${seatsLabel(seats)}` : ''}
                </p>
              </div>
              {seats?.limit != null ? (
                <span className="inline-flex items-center rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                  {seats.reserved ?? seats.used}/{seats.limit} seats
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                  Unlimited seats
                </span>
              )}
            </div>

            {manage ? (
              <form
                onSubmit={handleInvite}
                className="mt-6 grid gap-4 border-t border-ink-100 pt-6 sm:grid-cols-[1fr_auto_auto]"
              >
                <FormField id="invite-email" label="Invite by email">
                  <input
                    id="invite-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClassName}
                    placeholder="teammate@company.com"
                    required
                  />
                </FormField>
                <FormField id="invite-role" label="Role">
                  <select
                    id="invite-role"
                    value={inviteRoleRef}
                    onChange={(e) => setInviteRoleRef(e.target.value)}
                    className={inputClassName}
                  >
                    {assignableOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="flex items-end">
                  <Button type="submit" disabled={inviting}>
                    {inviting ? 'Inviting…' : 'Send invite'}
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-6 border-t border-ink-100 pt-6 text-sm text-ink-500">
                You need the manage-members permission to invite teammates.
              </p>
            )}

            {lastInviteUrl ? (
              <div className="mt-4 rounded-lg border border-signal-600/30 bg-signal-50 p-4">
                <p className="text-sm font-medium text-signal-800">Invite link</p>
                <p className="mt-1 text-xs text-signal-800/80">
                  Share this if email delivery is unavailable. It expires with the invite.
                </p>
                <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-xs text-ink-900">
                  {lastInviteUrl}
                </code>
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-9 px-3 py-1.5 text-sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(lastInviteUrl);
                        toast.success('Invite link copied');
                      } catch {
                        toast.error('Could not copy');
                      }
                    }}
                  >
                    Copy link
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-ink-100 px-6 py-4">
              <h3 className="font-display text-base font-bold text-ink-900">Members</h3>
            </div>
            {members.length === 0 ? (
              <p className="p-6 text-sm text-ink-500">No members yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {members.map((m) => {
                  const isSelf = m.userId === user?.id;
                  const label = m.displayName || m.email;
                  const isOwner = m.role === 'owner' && !m.customRoleId;
                  const isAdminPeer = !m.customRoleId && (m.role === 'admin' || m.role === 'owner');
                  const showRemove =
                    manage &&
                    !(isOwner && members.filter((x) => x.role === 'owner' && !x.customRoleId).length <= 1) &&
                    !( !meIsOwner && isAdminPeer);
                  const showRoleSelect =
                    manage && !isSelf && !(!meIsOwner && isAdminPeer);
                  const currentRef = memberRoleRef(m);
                  const selectOptions = [
                    ...(meIsOwner ? [{ value: 'owner', label: 'Owner' }] : []),
                    ...assignableOptions,
                  ];
                  // Ensure current custom/system value appears even if filtered out
                  if (!selectOptions.some((o) => o.value === currentRef) && currentRef) {
                    selectOptions.unshift({
                      value: currentRef,
                      label: roleDisplay(m),
                    });
                  }

                  return (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900">
                          {label}
                          {isSelf ? (
                            <span className="ml-2 text-xs font-normal text-ink-500">(you)</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-500">{m.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {showRoleSelect ? (
                          <select
                            className={`${inputClassName} min-h-9 w-auto py-1.5 text-sm`}
                            value={currentRef}
                            onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                            aria-label={`Role for ${label}`}
                          >
                            {selectOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                            {roleDisplay(m)}
                          </span>
                        )}
                        {showRemove || (isSelf && !isOwner) ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="min-h-9 px-3 py-1.5 text-sm"
                            onClick={() =>
                              handleRemove(m.userId, isSelf ? 'yourself' : label)
                            }
                          >
                            {isSelf ? 'Leave' : 'Remove'}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden" id="roles">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-6 py-4">
              <div>
                <h3 className="font-display text-base font-bold text-ink-900">Roles</h3>
                <p className="mt-0.5 text-sm text-ink-500">
                  Built-in roles plus custom permission sets for this organization.
                </p>
              </div>
              {manageRoles && editingRole == null ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-9 px-3 py-1.5 text-sm"
                  onClick={() => setEditingRole('new')}
                >
                  Create role
                </Button>
              ) : null}
            </div>

            <div className="space-y-4 p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  System
                </p>
                <ul className="mt-2 divide-y divide-ink-100 rounded-lg border border-ink-100">
                  {systemRoles.map((r) => (
                    <li key={r.key} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-ink-900">{r.name}</p>
                        <span className="text-xs text-ink-400">{r.key}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-ink-500">{r.description}</p>
                      <p className="mt-1 font-mono text-xs text-ink-400">
                        {(r.permissions || []).join(', ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Custom
                </p>
                {customRoles.length === 0 && editingRole == null ? (
                  <p className="mt-2 text-sm text-ink-500">
                    No custom roles yet.
                    {manageRoles ? ' Create one to grant a specific permission set.' : ''}
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-ink-100 rounded-lg border border-ink-100">
                    {customRoles.map((r) => (
                      <li key={r.id} className="px-4 py-3">
                        {editingRole && editingRole !== 'new' && editingRole.id === r.id ? (
                          <RoleEditor
                            permissionsCatalog={permissionsCatalog}
                            initial={r}
                            saving={savingRole}
                            onSave={handleSaveRole}
                            onCancel={() => setEditingRole(null)}
                          />
                        ) : (
                          <>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-ink-900">{r.name}</p>
                                {r.description ? (
                                  <p className="mt-0.5 text-sm text-ink-500">{r.description}</p>
                                ) : null}
                                <p className="mt-1 text-xs text-ink-400">
                                  {r.memberCount || 0} member
                                  {(r.memberCount || 0) === 1 ? '' : 's'} · key{' '}
                                  <span className="font-mono">{r.key}</span>
                                </p>
                                <p className="mt-1 font-mono text-xs text-ink-400">
                                  {(r.permissions || []).join(', ') || 'No permissions'}
                                </p>
                              </div>
                              {manageRoles ? (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="min-h-9 px-3 py-1.5 text-sm"
                                    onClick={() => setEditingRole(r)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="min-h-9 px-3 py-1.5 text-sm"
                                    onClick={() => handleDeleteRole(r)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {editingRole === 'new' ? (
                  <div className="mt-3 rounded-lg border border-ink-100 px-4 py-3">
                    <RoleEditor
                      permissionsCatalog={permissionsCatalog}
                      initial={null}
                      saving={savingRole}
                      onSave={handleSaveRole}
                      onCancel={() => setEditingRole(null)}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-ink-100 px-6 py-4">
              <h3 className="font-display text-base font-bold text-ink-900">Pending invites</h3>
            </div>
            {invites.length === 0 ? (
              <p className="p-6 text-sm text-ink-500">No pending invites.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {invites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink-900">{inv.email}</p>
                      <p className="mt-0.5 text-sm text-ink-500">
                        {roleDisplay(inv)}
                        {inv.expiresAt
                          ? ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>
                    {manage ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-9 px-3 py-1.5 text-sm"
                        onClick={() => handleRevoke(inv.id)}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
