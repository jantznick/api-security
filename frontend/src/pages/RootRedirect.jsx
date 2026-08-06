import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { marketingLoginUrl } from '../lib/urls';

/** `/` → projects if authed, else marketing login. */
export default function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.replace(marketingLoginUrl());
    }
  }, [isLoading, isAuthenticated]);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50">
      <p className="text-sm text-ink-600">Redirecting to sign in…</p>
    </div>
  );
}
