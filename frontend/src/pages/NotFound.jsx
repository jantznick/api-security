import { Link } from 'react-router-dom';
import { APP_NAME } from '../lib/brand';
import { MARKETING_URL } from '../lib/urls';
import Button from '../components/Button';

/** Branded in-app 404 for unknown client routes. */
export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-ink-100 via-ink-50 to-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 20% 10%, rgba(15,122,98,0.12), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 80%, rgba(22,40,34,0.08), transparent 50%)',
        }}
      />
      <header className="relative z-10 px-4 py-6 sm:px-8">
        <Link
          to="/projects"
          className="font-display text-lg font-bold tracking-tight text-ink-900"
        >
          {APP_NAME}
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-20 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-ink-500">
          404
        </p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3.25rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-ink-900">
          Page not found
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-ink-600 sm:text-lg">
          That URL is not part of {APP_NAME}. Check the address, or head back to your
          projects.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/projects">
            <Button type="button">Go to projects</Button>
          </Link>
          <a href={MARKETING_URL}>
            <Button type="button" variant="secondary">
              Homepage
            </Button>
          </a>
        </div>
      </main>
    </div>
  );
}
