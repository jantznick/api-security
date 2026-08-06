import { Link } from 'react-router-dom';
import { APP_NAME } from '../lib/brand';

/** Minimal chrome for login / register (no site footer). */
export default function AuthShell({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--hero-mesh)]">
      <header className="page-shell flex items-center py-5">
        <Link
          to="/"
          className="font-display text-[1.1rem] font-bold tracking-tight text-ink"
        >
          {APP_NAME}
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        {children}
      </div>
    </div>
  );
}
