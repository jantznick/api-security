import { Link } from 'react-router-dom';
import { APP_URL } from '../lib/urls';

export default function NotFound() {
  return (
    <div className="page-shell flex min-h-[62vh] max-w-xl flex-col justify-center py-24">
      <p className="anim-rise font-mono text-sm tracking-wide text-signal">404</p>
      <h1 className="anim-rise-delay-1 mt-3 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        Page not found
      </h1>
      <p className="anim-rise-delay-2 mt-5 text-lg leading-relaxed text-muted">
        That page doesn’t exist. Go home or open the dashboard.
      </p>
      <div className="anim-rise-delay-3 mt-10 flex flex-wrap gap-3">
        <Link to="/" className="btn btn-primary">
          Back home
        </Link>
        <a href={APP_URL} className="btn btn-secondary">
          Open app
        </a>
      </div>
    </div>
  );
}
