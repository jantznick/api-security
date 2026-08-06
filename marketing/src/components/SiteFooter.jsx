import { Link } from 'react-router-dom';
import { APP_NAME } from '../lib/brand';
import { DOCS_URL, APP_URL } from '../lib/urls';

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-canvas-deep">
      <div className="page-shell flex flex-col gap-10 py-14 md:flex-row md:justify-between md:gap-16">
        <div className="max-w-sm">
          <p className="font-display text-lg font-bold tracking-tight text-ink">
            {APP_NAME}
          </p>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">
            See your endpoints, schemas, and field types from real traffic.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-14 gap-y-8 text-sm">
          <div className="flex min-w-[7rem] flex-col gap-2.5">
            <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
              Product
            </span>
            <Link
              to="/how-it-works"
              className="text-muted transition-colors hover:text-ink"
            >
              How it works
            </Link>
            <Link
              to="/get-started"
              className="text-muted transition-colors hover:text-ink"
            >
              Get started
            </Link>
            <a
              href={DOCS_URL}
              className="text-muted transition-colors hover:text-ink"
            >
              Docs
            </a>
            <a
              href={APP_URL}
              className="text-muted transition-colors hover:text-ink"
            >
              Dashboard
            </a>
          </div>
          <div className="flex min-w-[7rem] flex-col gap-2.5">
            <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
              Legal
            </span>
            <Link
              to="/privacy"
              className="text-muted transition-colors hover:text-ink"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="text-muted transition-colors hover:text-ink"
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-line/70">
        <p className="page-shell py-4 text-xs tracking-wide text-muted">
          © {new Date().getFullYear()} {APP_NAME}
          <span className="mx-2 text-line" aria-hidden="true">
            ·
          </span>
          apiglimpse.com
        </p>
      </div>
    </footer>
  );
}
