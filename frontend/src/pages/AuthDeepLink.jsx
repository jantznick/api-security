import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/** /login and /register → `/` with ?auth=… (modal), preserving token/redirect/email. */
export default function AuthDeepLink({ mode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('auth', mode);
    navigate({ pathname: '/', search: next.toString() }, { replace: true });
  }, [mode, navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50">
      <p className="text-sm text-ink-600">Loading…</p>
    </div>
  );
}
