import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const AuthModalContext = createContext(null);

function normalizeTab(value) {
  if (value === 'register' || value === 'signup' || value === 'sign-up') return 'register';
  if (value === 'login' || value === 'signin' || value === 'sign-in') return 'login';
  return null;
}

export function AuthModalProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('login');

  const syncFromParams = useCallback(() => {
    const authTab = normalizeTab(searchParams.get('auth'));
    const hasToken = Boolean(searchParams.get('token'));
    if (authTab) {
      setTab(authTab);
      setOpen(true);
      return;
    }
    if (hasToken) {
      setTab('login');
      setOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    syncFromParams();
  }, [syncFromParams]);

  const openAuth = useCallback(
    (nextTab = 'login') => {
      const resolved = normalizeTab(nextTab) || 'login';
      setTab(resolved);
      setOpen(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('auth', resolved);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const closeAuth = useCallback(() => {
    setOpen(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('auth');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const setAuthTab = useCallback(
    (nextTab) => {
      const resolved = normalizeTab(nextTab) || 'login';
      setTab(resolved);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('auth', resolved);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const value = useMemo(
    () => ({
      open,
      tab,
      openAuth,
      closeAuth,
      setAuthTab,
      searchParams,
      setSearchParams,
    }),
    [open, tab, openAuth, closeAuth, setAuthTab, searchParams, setSearchParams],
  );

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) {
    throw new Error('useAuthModal must be used within AuthModalProvider');
  }
  return ctx;
}
