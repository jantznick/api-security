import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <p className="text-sm text-ink-600">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}` || '/projects';
    const params = new URLSearchParams();
    params.set('auth', 'login');
    params.set('redirect', redirect);
    return <Navigate to={`/?${params.toString()}`} replace />;
  }

  return children;
}
