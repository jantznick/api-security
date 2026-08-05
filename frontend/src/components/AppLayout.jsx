import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import useAuthStore from '../store/authStore';
import { APP_NAME } from '../lib/brand';
import Button from './Button';

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch {
      /* ignore */
    }
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/projects" className="text-lg font-semibold text-ink-900">
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-600 sm:inline">{user?.email}</span>
            <Button variant="secondary" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
