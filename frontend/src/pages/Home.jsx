import { Link, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { APP_NAME, APP_TAGLINE } from '../lib/brand';
import Button from '../components/Button';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/projects" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 text-ink-50">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -20%, #3d5a4f, transparent), linear-gradient(180deg, transparent, #121a17)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-ink-300">POC</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{APP_NAME}</h1>
        <p className="mt-4 max-w-xl text-lg text-ink-300">{APP_TAGLINE}</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/register">
            <Button>Get started</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" className="border-ink-600 bg-ink-900 text-ink-50 hover:bg-ink-800">
              Sign in
            </Button>
          </Link>
        </div>
        <p className="mt-12 text-sm text-ink-400">
          Middleware → agent → inventory. No raw traffic stored. See docs/TESTING.md to verify.
        </p>
      </div>
    </div>
  );
}
