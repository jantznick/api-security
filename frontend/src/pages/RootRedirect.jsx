import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import Welcome from './Welcome';

/** `/` → projects if authed, else welcome + auth modal CTAs. */
export default function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <p className="text-sm text-ink-600">Loading…</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/projects" replace />;
  }

  return <Welcome />;
}
