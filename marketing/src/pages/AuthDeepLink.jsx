import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Thin /login and /register routes: open the auth modal on `/` (or preserve
 * path via redirect) while keeping token / email / redirect query params.
 */
export default function AuthDeepLink({ mode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('auth', mode);
    navigate({ pathname: '/', search: next.toString() }, { replace: true });
  }, [mode, navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--hero-mesh)]">
      <p className="text-sm text-muted">Loading…</p>
    </div>
  );
}
