import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { orgsAPI } from '../api/api';
import AppLayout from '../components/AppLayout';
import Button from '../components/Button';
import Card from '../components/Card';
import FormField, { inputClassName } from '../components/FormField';
import PageHeader from '../components/PageHeader';
import useAuthStore from '../store/authStore';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

function roleLabel(role) {
  if (!role) return '—';
  return String(role).charAt(0).toUpperCase() + String(role).slice(1);
}

function canManage(role) {
  return role === 'owner' || role === 'admin';
}

function seatsLabel(seats) {
  if (!seats) return null;
  const used = seats.reserved ?? seats.used;
  if (seats.limit == null) return `${used} seats used (unlimited)`;
  return `${used} / ${seats.limit} seats`;
}

export default function OrgMembers() {
  const { orgId } = useParams();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [seats, setSeats] = useState(null);
  const [meRole, setMeRole] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [membersData, invitesData] = await Promise.all([
        orgsAPI.listMembers(orgId),
        orgsAPI.listInvites(orgId),
      ]);
      setOrganization(membersData.organization);
      setMembers(membersData.members || []);
      setSeats(membersData.seats || null);
      setMeRole(membersData.me?.role || null);
      setInvites(invitesData.invites || []);
    } catch (err) {
      toast.error(err?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const manage = canManage(meRole);

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
      const data = await orgsAPI.createInvite(orgId, { email: trimmed, role });
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
    if (!window.confirm(`Remove ${label} from this organization?`)) return;
    try {
      await orgsAPI.removeMember(orgId, userId);
      toast.success('Member removed');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not remove member');
    }
  };

  const handleRoleChange = async (userId, nextRole) => {
    try {
      await orgsAPI.updateMember(orgId, userId, { role: nextRole });
      toast.success('Role updated');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not update role');
    }
  };

  const title = organization?.name || 'Organization';

  return (
    <AppLayout>
      <PageHeader
        title="Members"
        description={`${title} — invite teammates, manage roles, and track seats.`}
        actions={
          <Link
            to="/account"
            className="text-sm font-medium text-signal-600 hover:text-signal-800"
          >
            ← Account
          </Link>
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
              <form onSubmit={handleInvite} className="mt-6 grid gap-4 border-t border-ink-100 pt-6 sm:grid-cols-[1fr_auto_auto]">
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
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={inputClassName}
                  >
                    {ROLE_OPTIONS.filter((opt) =>
                      meRole === 'owner' ? true : opt.value !== 'admin',
                    ).map((opt) => (
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
                Only owners and admins can invite teammates.
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
                  const showRemove =
                    manage &&
                    !(m.role === 'owner' && members.filter((x) => x.role === 'owner').length <= 1) &&
                    !(meRole === 'admin' && (m.role === 'admin' || m.role === 'owner'));
                  const showRoleSelect =
                    manage &&
                    !isSelf &&
                    !(meRole === 'admin' && (m.role === 'admin' || m.role === 'owner'));

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
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                            aria-label={`Role for ${label}`}
                          >
                            {meRole === 'owner' ? (
                              <option value="owner">Owner</option>
                            ) : null}
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                            {roleLabel(m.role)}
                          </span>
                        )}
                        {showRemove || (isSelf && m.role !== 'owner') ? (
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
                        {roleLabel(inv.role)}
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
