import { useEffect } from 'react';
import { marketingAuthUrl } from '../lib/urls';

/**
 * App /login and /register redirect to marketing auth (canonical UI).
 * Preserves the current query string (token, redirect, email, …).
 */
export default function MarketingAuthRedirect({ path }) {
  useEffect(() => {
    window.location.replace(marketingAuthUrl(path, window.location.search));
  }, [path]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50">
      <p className="text-sm text-ink-600">Redirecting to sign in…</p>
    </div>
  );
}
