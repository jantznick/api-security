import { useAuthModal } from '../context/AuthModalContext';
import { APP_NAME, APP_TAGLINE } from '../lib/brand';
import { DOCS_URL, MARKETING_URL } from '../lib/urls';
import Button from '../components/Button';

/** Unauthenticated landing on the app host — invites sign-in without a dead end. */
export default function Welcome() {
  const { openAuth } = useAuthModal();

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
        <a
          href={MARKETING_URL}
          className="font-display text-lg font-bold tracking-tight text-ink-900"
        >
          {APP_NAME}
        </a>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-20 text-center">
        <p className="font-display text-[clamp(2.5rem,8vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-ink-900">
          {APP_NAME}
        </p>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-600 sm:text-xl">
          {APP_TAGLINE}
        </p>
        <p className="mt-3 max-w-sm text-sm text-ink-500">
          Sign in to open your projects, or create an account to get started.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={() => openAuth('login')}>
            Sign in
          </Button>
          <Button type="button" variant="secondary" onClick={() => openAuth('register')}>
            Create account
          </Button>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-ink-500">
          <a
            href={MARKETING_URL}
            className="transition-colors hover:text-ink-800"
          >
            Homepage
          </a>
          <a
            href={DOCS_URL}
            className="transition-colors hover:text-ink-800"
            target="_blank"
            rel="noreferrer"
          >
            DeveloperDocs
          </a>
        </div>
      </main>
    </div>
  );
}
