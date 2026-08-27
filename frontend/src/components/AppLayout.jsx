import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { authAPI } from '../api/api';
import useAuthStore from '../store/authStore';
import { useActiveOrg } from '../hooks/useActiveOrg';
import { APP_NAME } from '../lib/brand';
import { DOCS_URL, loginUrl } from '../lib/urls';
import Button from './Button';
import CreateOrgForm from './CreateOrgForm';

const ADD_ORG_VALUE = '__add_org__';

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium transition-colors ${
    isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'
  }`;

export default function AppLayout({ children }) {
  const { user, logout } = useAuthStore();
  const { orgs, activeOrgId, setActiveOrgId } = useActiveOrg();
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const membersPath = activeOrgId ? `/orgs/${activeOrgId}/members` : '/account';
  const teamPath = membersPath;

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch {
      /* ignore */
    }
    logout();
    window.location.assign(loginUrl());
  };

  const handleOrgChange = (value) => {
    if (value === ADD_ORG_VALUE) {
      setShowCreateOrg(true);
      return;
    }
    setActiveOrgId(value);
  };

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Link
              to="/projects"
              className="shrink-0 font-display text-lg font-bold tracking-tight text-ink-900"
            >
              {APP_NAME}
            </Link>
            {orgs.length >= 1 ? (
              <label className="hidden min-w-0 items-center gap-2 sm:flex">
                <span className="sr-only">Organization</span>
                <select
                  className="max-w-[14rem] truncate rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-800"
                  value={activeOrgId || ''}
                  onChange={(e) => handleOrgChange(e.target.value)}
                  aria-label="Switch organization"
                >
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.isPersonal ? `${org.name} (Personal)` : org.name}
                    </option>
                  ))}
                  <option value={ADD_ORG_VALUE}>＋ Add organization…</option>
                </select>
              </label>
            ) : null}
            <nav className="hidden items-center gap-4 sm:flex" aria-label="App">
              <NavLink to="/projects" className={navLinkClass} end={false}>
                Projects
              </NavLink>
              <NavLink to={teamPath} className={navLinkClass}>
                Team
              </NavLink>
              <NavLink to="/usage" className={navLinkClass}>
                Usage
              </NavLink>
              <NavLink to="/account" className={navLinkClass}>
                Account
              </NavLink>
              <NavLink to="/billing" className={navLinkClass}>
                Billing
              </NavLink>
              {user?.isAdmin ? (
                <NavLink to="/admin" className={navLinkClass}>
                  Admin
                </NavLink>
              ) : null}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
              >
                Docs
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[14rem] truncate text-sm text-ink-500 sm:inline">
              {user?.displayName || user?.email}
            </span>
            <Button
              variant="secondary"
              className="min-h-9 px-3 py-1.5 text-sm"
              onClick={handleLogout}
            >
              Sign out
            </Button>
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-6xl gap-4 overflow-x-auto border-t border-ink-100 px-4 py-2 sm:hidden"
          aria-label="App mobile"
        >
          {orgs.length >= 1 ? (
            <select
              className="max-w-[12rem] truncate rounded-md border border-ink-200 bg-white px-2 py-1 text-sm text-ink-800"
              value={activeOrgId || ''}
              onChange={(e) => handleOrgChange(e.target.value)}
              aria-label="Switch organization"
            >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
              <option value={ADD_ORG_VALUE}>＋ Add organization…</option>
            </select>
          ) : null}
          <NavLink to="/projects" className={navLinkClass}>
            Projects
          </NavLink>
          <NavLink to={teamPath} className={navLinkClass}>
            Team
          </NavLink>
          <NavLink to="/usage" className={navLinkClass}>
            Usage
          </NavLink>
          <NavLink to="/account" className={navLinkClass}>
            Account
          </NavLink>
          <NavLink to="/billing" className={navLinkClass}>
            Billing
          </NavLink>
          {user?.isAdmin ? (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          ) : null}
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-sm text-ink-500">
            Docs
          </a>
        </nav>
      </header>
      {showCreateOrg ? (
        <div className="border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-4">
            <p className="mb-3 text-sm font-medium text-ink-800">New organization</p>
            <p className="mb-3 text-xs text-ink-500">
              Team orgs have their own projects, members, and seats. Your personal workspace stays
              available in the switcher.
            </p>
            <CreateOrgForm
              onCancel={() => setShowCreateOrg(false)}
              onCreated={() => setShowCreateOrg(false)}
            />
          </div>
        </div>
      ) : null}
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
