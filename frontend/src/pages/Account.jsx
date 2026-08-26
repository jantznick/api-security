import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { authAPI } from '../api/api';
import useAuthStore from '../store/authStore';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import FormField, { inputClassName } from '../components/FormField';
import { DOCS_URL, loginUrl } from '../lib/urls';
import { useActiveOrg } from '../hooks/useActiveOrg';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'shortcuts', label: 'Shortcuts' },
];

function formatDate(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function planLabel(slug) {
  if (!slug) return 'Free';
  const s = String(slug);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function roleLabel(role) {
  if (!role) return null;
  const s = String(role);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sectionNavClass(active) {
  return `block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
    active
      ? 'bg-signal-50 text-signal-800'
      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
  }`;
}

function ProfileSection({ user, onSaved }) {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName || '');
  }, [user?.displayName, user?.id]);

  const copyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      toast.success('Email copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await authAPI.updateMe({ displayName });
      onSaved(data.user);
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const created = formatDate(user?.createdAt);
  const dirty = (displayName || '') !== (user?.displayName || '');

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink-900">Profile</h2>
      <p className="mt-1 text-sm text-ink-500">
        How you appear in API Glimpse. Email changes are not available yet.
      </p>

      <dl className="mt-6 space-y-4 text-sm">
        <div>
          <dt className="font-medium text-ink-500">Email</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-3 text-ink-900">
            <span>{user?.email || '—'}</span>
            {user?.email ? (
              <button
                type="button"
                onClick={copyEmail}
                className="cursor-pointer text-sm font-medium text-signal-600 hover:text-signal-800"
              >
                Copy
              </button>
            ) : null}
          </dd>
        </div>
        {created ? (
          <div>
            <dt className="font-medium text-ink-500">Member since</dt>
            <dd className="mt-1 text-ink-900">{created}</dd>
          </div>
        ) : null}
      </dl>

      <form onSubmit={handleSave} className="mt-6 space-y-4 border-t border-ink-100 pt-6">
        <FormField
          id="display-name"
          label="Display name"
          hint="Optional. Up to 80 characters."
        >
          <input
            id="display-name"
            type="text"
            maxLength={80}
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClassName}
            placeholder="Your name"
          />
        </FormField>
        <Button type="submit" disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>

      <div className="mt-8 border-t border-ink-100 pt-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="cursor-pointer text-sm font-medium text-ink-600 hover:text-ink-900"
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? 'Hide advanced' : 'Advanced'}
        </button>
        {advancedOpen && user?.id ? (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">User ID</p>
            <p className="mt-1 break-all font-mono text-sm text-ink-700">{user.id}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function SecuritySection({ onLogout }) {
  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink-900">Security</h2>
      <p className="mt-1 text-sm text-ink-500">
        Sign out of this browser. Password and magic-link sign-in both remain available —
        use whichever you prefer when you return.
      </p>
      <div className="mt-6">
        <Button variant="secondary" onClick={onLogout}>
          Sign out
        </Button>
      </div>
    </Card>
  );
}

function OrganizationsSection({ user }) {
  const orgs = Array.isArray(user?.orgs) ? user.orgs : [];
  const { setActiveOrgId } = useActiveOrg();
  const accountPlan = planLabel(user?.planSlug);

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink-900">Organizations</h2>
      <p className="mt-1 text-sm text-ink-500">
        Your workspaces and team orgs. Invite teammates from Members — Free plans include up
        to 3 seats (you count as one).
      </p>

      {orgs.length > 0 ? (
        <ul className="mt-6 divide-y divide-ink-100 border-t border-ink-100">
          {orgs.map((org) => {
            const orgPlan = planLabel(org.planSlug || user?.planSlug);
            const role = roleLabel(org.role);
            const seats = org.seats;
            const seatText =
              seats?.limit != null
                ? `${seats.used ?? 0} / ${seats.limit} seats`
                : seats?.used != null
                  ? `${seats.used} seats`
                  : null;
            return (
              <li
                key={org.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink-900">
                      {org.name || 'Organization'}
                    </p>
                    {org.isPersonal ? (
                      <span className="inline-flex items-center rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-700">
                        Personal
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {[role, orgPlan ? `${orgPlan} plan` : null, seatText]
                      .filter(Boolean)
                      .join(' · ') || 'Member'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/orgs/${org.id}/members`}
                    onClick={() => setActiveOrgId(org.id)}
                    className="inline-flex min-h-9 items-center rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
                  >
                    Members
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 border-t border-ink-100 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink-900">Personal workspace</p>
              <p className="mt-0.5 text-sm text-ink-500">
                Created automatically for your account
              </p>
            </div>
            <span className="inline-flex items-center rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
              {accountPlan}
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/projects">
          <Button type="button" variant="secondary">
            Projects
          </Button>
        </Link>
        <Link to="/usage">
          <Button type="button" variant="secondary">
            Usage & seats
          </Button>
        </Link>
        <Link to="/billing">
          <Button type="button" variant="secondary">
            Billing
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function PreferencesSection() {
  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink-900">Preferences</h2>
      <p className="mt-1 text-sm text-ink-500">
        Timezone and notification preferences will land here. Nothing to configure yet.
      </p>
      <div className="mt-6 rounded-lg border border-dashed border-ink-200 bg-ink-50/60 px-4 py-6 text-sm text-ink-500">
        Timezone — coming soon
      </div>
    </Card>
  );
}

function ShortcutsSection() {
  const links = [
    { to: '/usage', label: 'Usage', external: false, hint: 'Plan limits and consumption' },
    { to: '/billing', label: 'Billing', external: false, hint: 'Plan and payment settings' },
    { to: DOCS_URL, label: 'Docs', external: true, hint: 'Integration guides and reference' },
  ];

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold text-ink-900">Shortcuts</h2>
      <p className="mt-1 text-sm text-ink-500">Jump to related areas of the product.</p>
      <ul className="mt-6 divide-y divide-ink-100 border-t border-ink-100">
        {links.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-ink-900">{item.label}</p>
              <p className="text-sm text-ink-500">{item.hint}</p>
            </div>
            {item.external ? (
              <a
                href={item.to}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-signal-600 hover:text-signal-800"
              >
                Open
              </a>
            ) : (
              <Link
                to={item.to}
                className="text-sm font-medium text-signal-600 hover:text-signal-800"
              >
                Open
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Account() {
  const { user, setUser, logout } = useAuthStore();
  const [section, setSection] = useState('profile');

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch {
      /* ignore */
    }
    logout();
    window.location.assign(loginUrl());
  };

  return (
    <AppLayout>
      <PageHeader
        title="Account"
        description="Profile, security, and workspace settings."
      />

      <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-start">
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-visible"
          aria-label="Account sections"
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`cursor-pointer whitespace-nowrap ${sectionNavClass(section === s.id)}`}
              aria-current={section === s.id ? 'page' : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {section === 'profile' ? (
            <ProfileSection user={user} onSaved={setUser} />
          ) : null}
          {section === 'security' ? (
            <SecuritySection onLogout={handleLogout} />
          ) : null}
          {section === 'organizations' ? (
            <OrganizationsSection user={user} />
          ) : null}
          {section === 'preferences' ? <PreferencesSection /> : null}
          {section === 'shortcuts' ? <ShortcutsSection /> : null}
        </div>
      </div>
    </AppLayout>
  );
}
