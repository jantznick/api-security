import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../api/api';
import useAuthStore from '../store/authStore';
import { APP_TAGLINE } from '../lib/brand';
import Button from '../components/Button';
import AuthShell from '../components/AuthShell';

const urlTokensInFlight = new Set();

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/projects';
  const { setUser, isAuthenticated, isLoading } = useAuthStore();
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestingToken, setRequestingToken] = useState(false);
  const [tokenRequested, setTokenRequested] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || location.pathname !== '/register' || urlTokensInFlight.has(token)) {
      return;
    }

    urlTokensInFlight.add(token);
    setLoading(true);
    setError('');

    authAPI
      .loginWithMagicToken(token)
      .then((data) => {
        setUser(data.user);
        navigate(redirectTo, { replace: true });
      })
      .catch((err) => {
        urlTokensInFlight.delete(token);
        setError(err.message);
        setLoading(false);
      });
  }, [searchParams, location.pathname, setUser, navigate, redirectTo]);

  if (!isLoading && isAuthenticated && !searchParams.get('token')) {
    return <Navigate to={redirectTo} replace />;
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await authAPI.register(email, password);
      setUser(data.user);
      navigate(redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
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
      await authAPI.requestMagicToken(email, 'register');
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
      const data = await authAPI.loginWithMagicToken(code);
      setUser(data.user);
      navigate(redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loginQuery = searchParams.toString();
  const loginHref = loginQuery ? `/login?${loginQuery}` : '/login';

  return (
    <AuthShell>
      <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-ink-900">Create account</h1>
        <p className="mt-2 text-sm text-ink-600">{APP_TAGLINE}</p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {loading && searchParams.get('token') ? (
          <p className="mt-6 text-sm text-ink-600">Creating your account...</p>
        ) : !tokenRequested ? (
          <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-800">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200"
              />
              <button
                type="button"
                onClick={handleRequestMagicLink}
                disabled={requestingToken || !email.trim()}
                className="mt-1.5 cursor-pointer text-sm text-ink-600 hover:text-ink-900 disabled:opacity-50"
              >
                {requestingToken ? 'Sending...' : 'Email me a magic link instead'}
              </button>
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-800">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleMagicCodeSubmit} className="mt-6 space-y-4">
            <p className="rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-700">
              We sent a sign-in link and 6-digit code to <strong>{email}</strong>.
            </p>
            <div>
              <label htmlFor="magic-code" className="mb-1 block text-sm font-medium text-ink-800">
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
                className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm tracking-widest focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200"
                placeholder="123456"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
              {loading ? 'Signing in...' : 'Complete sign-up with code'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setTokenRequested(false);
                setCode('');
                setError('');
              }}
              className="w-full cursor-pointer text-sm text-ink-600 hover:text-ink-900"
            >
              Create account with password instead
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-600">
          Already have an account?{' '}
          <Link to={loginHref} className="font-medium text-ink-700 hover:text-ink-900">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
