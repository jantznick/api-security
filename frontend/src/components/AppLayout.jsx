import { Link, NavLink } from 'react-router-dom';
import { authAPI } from '../api/api';
import useAuthStore from '../store/authStore';
import { APP_NAME } from '../lib/brand';
import { DOCS_URL, marketingLoginUrl } from '../lib/urls';
import Button from './Button';

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium transition-colors ${
    isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'
  }`;

export default function AppLayout({ children }) {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch {
      /* ignore */
    }
    logout();
    window.location.assign(marketingLoginUrl());
  };

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link
              to="/projects"
              className="font-display text-lg font-bold tracking-tight text-ink-900"
            >
              {APP_NAME}
            </Link>
            <nav className="hidden items-center gap-4 sm:flex" aria-label="App">
              <NavLink to="/projects" className={navLinkClass} end={false}>
                Projects
              </NavLink>
              <NavLink to="/account" className={navLinkClass}>
                Account
              </NavLink>
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
              {user?.email}
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
          className="mx-auto flex max-w-6xl gap-4 border-t border-ink-100 px-4 py-2 sm:hidden"
          aria-label="App mobile"
        >
          <NavLink to="/projects" className={navLinkClass}>
            Projects
          </NavLink>
          <NavLink to="/account" className={navLinkClass}>
            Account
          </NavLink>
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-sm text-ink-500">
            Docs
          </a>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
