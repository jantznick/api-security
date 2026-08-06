import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import Button from './Button';
import { useAuthModal } from '../context/AuthModalContext';
import useAuthStore from '../store/authStore';
import { APP_TAGLINE } from '../lib/brand';

const urlTokensInFlight = new Set();

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function resolveAppRedirect(redirectParam) {
  if (!redirectParam) return '/projects';
  if (redirectParam.startsWith('/')) return redirectParam;
  try {
    const target = new URL(redirectParam);
    if (typeof window !== 'undefined' && target.origin === window.location.origin) {
      return `${target.pathname}${target.search}` || '/projects';
    }
  } catch {
    /* ignore */
  }
  return '/projects';
}

export default function AuthModal() {
  const titleId = useId();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const navigate = useNavigate();
  const { setUser, isAuthenticated, isLoading: authBootLoading } = useAuthStore();
  const { open, tab, closeAuth, setAuthTab, searchParams, setSearchParams } = useAuthModal();

  const redirectTo = resolveAppRedirect(searchParams.get('redirect'));
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestingToken, setRequestingToken] = useState(false);
  const [tokenRequested, setTokenRequested] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setError('');
    setTokenRequested(false);
    setCode('');
    setRequestingToken(false);
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(emailParam);
  }, [open, tab, searchParams]);

  // Already signed in → go to app destination
  useEffect(() => {
    if (!open || authBootLoading || searchParams.get('token')) return;
    if (isAuthenticated) {
      closeAuth();
      navigate(redirectTo, { replace: true });
    }
  }, [open, authBootLoading, isAuthenticated, searchParams, redirectTo, closeAuth, navigate]);

  // Consume ?token=
  useEffect(() => {
    if (!open) return;
    const token = searchParams.get('token');
    if (!token || urlTokensInFlight.has(token)) return;

    urlTokensInFlight.add(token);
    setLoading(true);
    setError('');
    setAuthTab('login');

    authAPI
      .loginWithMagicToken(token)
      .then((data) => {
        setUser(data.user);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('token');
            next.delete('auth');
            return next;
          },
          { replace: true },
        );
        navigate(redirectTo, { replace: true });
      })
      .catch((err) => {
        urlTokensInFlight.delete(token);
        setError(err.message);
        setLoading(false);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('token');
            return next;
          },
          { replace: true },
        );
      });
  }, [open, searchParams, redirectTo, setAuthTab, setSearchParams, setUser, navigate]);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const panel = panelRef.current;
    const focusables = () => [...(panel?.querySelectorAll(FOCUSABLE) || [])];

    const t = window.setTimeout(() => {
      const nodes = focusables();
      const firstTab = nodes.find((el) => el.getAttribute('role') === 'tab') || nodes[0];
      firstTab?.focus();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAuth();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, closeAuth]);

  if (!open) return null;

  const isRegister = tab === 'register';
  const consumingToken = Boolean(loading && searchParams.get('token'));

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = isRegister
        ? await authAPI.register(email, password)
        : await authAPI.login(email, password);
      setUser(data.user);
      closeAuth();
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
      await authAPI.requestMagicToken(email, isRegister ? 'register' : 'login');
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
      closeAuth();
      navigate(redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink-900/40 backdrop-blur-[2px]"
        aria-label="Close sign in"
        onClick={closeAuth}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-xl border border-ink-200 bg-white p-6 shadow-lg sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-2xl font-semibold text-ink-900">
              {isRegister ? 'Create account' : 'Sign in'}
            </h2>
            <p className="mt-1.5 text-sm text-ink-600">{APP_TAGLINE}</p>
          </div>
          <button
            type="button"
            onClick={closeAuth}
            className="cursor-pointer px-2 py-1 text-sm text-ink-500 transition-colors hover:text-ink-900"
            aria-label="Close"
          >
            X
          </button>
        </div>

        <div role="tablist" aria-label="Account" className="mt-6 flex border-b border-ink-200">
          <button
            type="button"
            role="tab"
            aria-selected={!isRegister}
            id="auth-tab-login"
            aria-controls="auth-panel"
            className={`cursor-pointer px-3 py-2.5 text-sm font-medium transition-colors ${
              !isRegister
                ? 'border-b-2 border-signal-600 text-ink-900'
                : 'border-b-2 border-transparent text-ink-500 hover:text-ink-800'
            }`}
            onClick={() => setAuthTab('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRegister}
            id="auth-tab-register"
            aria-controls="auth-panel"
            className={`cursor-pointer px-3 py-2.5 text-sm font-medium transition-colors ${
              isRegister
                ? 'border-b-2 border-signal-600 text-ink-900'
                : 'border-b-2 border-transparent text-ink-500 hover:text-ink-800'
            }`}
            onClick={() => setAuthTab('register')}
          >
            Create account
          </button>
        </div>

        <div
          id="auth-panel"
          role="tabpanel"
          className="mt-5"
          aria-labelledby={isRegister ? 'auth-tab-register' : 'auth-tab-login'}
        >
          {error ? (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          {consumingToken ? (
            <p className="text-sm text-ink-600">Signing you in…</p>
          ) : !tokenRequested ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-ink-800">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200"
                />
                <button
                  type="button"
                  onClick={handleRequestMagicLink}
                  disabled={requestingToken || !email.trim()}
                  className="mt-1.5 cursor-pointer text-sm text-ink-600 hover:text-ink-900 disabled:opacity-50"
                >
                  {requestingToken ? 'Sending…' : 'Email me a magic link instead'}
                </button>
              </div>
              <div>
                <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-ink-800">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={isRegister ? 6 : undefined}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? isRegister
                    ? 'Creating account…'
                    : 'Signing in…'
                  : isRegister
                    ? 'Create account'
                    : 'Sign in'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleMagicCodeSubmit} className="space-y-4">
              <p className="rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-700">
                We sent a sign-in link and 6-digit code to <strong>{email}</strong>. Check your
                email or enter the code below.
              </p>
              <div>
                <label htmlFor="auth-magic-code" className="mb-1 block text-sm font-medium text-ink-800">
                  Sign-in code
                </label>
                <input
                  id="auth-magic-code"
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
                {loading
                  ? 'Signing in…'
                  : isRegister
                    ? 'Complete sign-up with code'
                    : 'Sign in with code'}
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
                {isRegister ? 'Create account with password instead' : 'Back to password sign-in'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
