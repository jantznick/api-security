import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { APP_NAME } from '../lib/brand';
import { useAuthModal } from '../context/AuthModalContext';
import { DOCS_URL } from '../lib/urls';

const linkClass = ({ isActive }) =>
  `relative text-[0.95rem] tracking-tight transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-signal after:transition-transform after:duration-200 ${
    isActive
      ? 'text-ink after:scale-x-100'
      : 'text-muted hover:text-ink hover:after:scale-x-100'
  }`;

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { openAuth } = useAuthModal();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/85 backdrop-blur-md">
      <div className="page-shell flex items-center justify-between gap-6 py-3.5 sm:py-4">
        <NavLink
          to="/"
          className="font-display text-[1.1rem] font-bold tracking-tight text-ink sm:text-[1.2rem]"
          onClick={() => setOpen(false)}
        >
          {APP_NAME}
        </NavLink>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          <NavLink to="/how-it-works" className={linkClass}>
            How it works
          </NavLink>
          <NavLink to="/get-started" className={linkClass}>
            Get started
          </NavLink>
          <a
            href={DOCS_URL}
            className="relative text-[0.95rem] tracking-tight text-muted transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-signal after:transition-transform after:duration-200 hover:text-ink hover:after:scale-x-100"
          >
            Docs
          </a>
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => openAuth('login')}
            className="hidden cursor-pointer text-[0.95rem] text-muted transition-colors hover:text-ink sm:inline"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => openAuth('register')}
            className="btn btn-primary btn-sm"
          >
            Sign up
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center border border-line px-2.5 py-2 text-sm text-ink transition-colors hover:border-ink/40 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          className="anim-rise flex flex-col gap-1 border-t border-line px-5 py-3 md:hidden"
          aria-label="Mobile"
        >
          <NavLink
            to="/how-it-works"
            className={({ isActive }) =>
              `py-2.5 text-[0.95rem] ${isActive ? 'text-ink' : 'text-muted'}`
            }
            onClick={() => setOpen(false)}
          >
            How it works
          </NavLink>
          <NavLink
            to="/get-started"
            className={({ isActive }) =>
              `py-2.5 text-[0.95rem] ${isActive ? 'text-ink' : 'text-muted'}`
            }
            onClick={() => setOpen(false)}
          >
            Get started
          </NavLink>
          <a
            href={DOCS_URL}
            className="py-2.5 text-[0.95rem] text-muted"
            onClick={() => setOpen(false)}
          >
            Docs
          </a>
          <button
            type="button"
            className="cursor-pointer py-2.5 text-left text-[0.95rem] text-muted sm:hidden"
            onClick={() => {
              setOpen(false);
              openAuth('login');
            }}
          >
            Sign in
          </button>
        </nav>
      ) : null}
    </header>
  );
}
