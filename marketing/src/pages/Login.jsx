import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authAPI } from '../api/api';
import { APP_TAGLINE } from '../lib/brand';
import AuthShell from '../components/AuthShell';
import { resolvePostAuthRedirect } from '../lib/urls';

const urlTokensInFlight = new Set();

function goToApp(redirectTo) {
  window.location.assign(redirectTo);
}

export default function Login() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = resolvePostAuthRedirect(searchParams.get('redirect'));
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [requestingToken, setRequestingToken] = useState(false);
  const [tokenRequested, setTokenRequested] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    let cancelled = false;
    authAPI
      .me()
      .then(() => {
        if (!cancelled && !searchParams.get('token')) {
          goToApp(redirectTo);
        } else if (!cancelled) {
          setCheckingSession(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [redirectTo, searchParams]);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || location.pathname !== '/login' || urlTokensInFlight.has(token)) {
      return;
    }

    urlTokensInFlight.add(token);
    setLoading(true);
    setError('');
    setCheckingSession(false);

    authAPI
      .loginWithMagicToken(token)
      .then(() => {
        goToApp(redirectTo);
      })
      .catch((err) => {
        urlTokensInFlight.delete(token);
        setError(err.message);
        setLoading(false);
      });
  }, [searchParams, location.pathname, redirectTo]);

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authAPI.login(email, password);
      goToApp(redirectTo);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleRequestMagicLink = async () => {
    if (!email.trim()) {
      setError('Enter your email first');
      return;
    }
    setError('');
    setRequestingToken(true);
    try {
      await authAPI.requestMagicToken(email, 'login');
      setTokenRequested(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setRequestingToken(false);
    }
  };

  const handleMagicCodeSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authAPI.loginWithMagicToken(code);
      goToApp(redirectTo);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const registerQuery = searchParams.toString();
  const registerHref = registerQuery ? `/register?${registerQuery}` : '/register';

  if (checkingSession) {
    return (
      <AuthShell>
        <p className="text-sm text-muted">Loading…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="w-full max-w-md border border-line bg-surface p-8 shadow-sm">
        <Link to="/" className="text-sm text-muted transition-colors hover:text-ink">
          ← Home
        </Link>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-muted">{APP_TAGLINE}</p>

        {error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {loading && searchParams.get('token') ? (
          <p className="mt-6 text-sm text-muted">Signing you in…</p>
        ) : !tokenRequested ? (
          <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-soft">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20"
              />
              <button
                type="button"
                onClick={handleRequestMagicLink}
                disabled={requestingToken || !email.trim()}
                className="mt-1.5 cursor-pointer text-sm text-signal hover:text-signal-bright disabled:opacity-50"
              >
                {requestingToken ? 'Sending…' : 'Email me a magic link instead'}
              </button>
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-soft">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMagicCodeSubmit} className="mt-6 space-y-4">
            <p className="rounded-md bg-canvas-deep/60 px-3 py-2 text-sm text-ink-soft">
              We sent a sign-in link and 6-digit code to <strong>{email}</strong>. Check your
              email or enter the code below.
            </p>
            <div>
              <label htmlFor="magic-code" className="mb-1 block text-sm font-medium text-ink-soft">
                Sign-in code
              </label>
              <input
                id="magic-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full border border-line bg-white px-3 py-2.5 text-sm tracking-widest text-ink focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20"
                placeholder="123456"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading || code.length !== 6}
            >
              {loading ? 'Signing in…' : 'Sign in with code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTokenRequested(false);
                setCode('');
                setError('');
              }}
              className="w-full cursor-pointer text-sm text-muted hover:text-ink"
            >
              Back to password sign-in
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          Need an account?{' '}
          <Link to={registerHref} className="font-medium text-signal hover:text-signal-bright">
            Create account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
