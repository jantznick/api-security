import { Link } from 'react-router-dom';
import { useAuthModal } from '../context/AuthModalContext';
import { DOCS_URL, integratingDocsUrl } from '../lib/urls';

const steps = [
  {
    n: '01',
    title: 'Create an account',
    body: 'Sign up, create a project, and create an API key. The key is shown once when you create it — copy it then.',
    cta: { auth: 'register', label: 'Sign up →' },
  },
  {
    n: '02',
    title: 'Add a connector',
    body: 'Install a connector for your stack (example: Express), set your API key and API Glimpse URL, and mount it. Details are in the docs.',
    cta: { href: integratingDocsUrl, label: 'Install guide →' },
  },
  {
    n: '03',
    title: 'Open the dashboard',
    body: 'Hit a few of your routes, then open your project. You should see endpoints and schemas within a few seconds.',
  },
];

export default function GetStarted() {
  const { openAuth } = useAuthModal();

  return (
    <div className="prose-page">
      <p className="section-eyebrow anim-rise">Start here</p>
      <h1 className="anim-rise-delay-1 section-title mt-3 text-4xl sm:text-5xl">
        Get started
      </h1>
      <p className="anim-rise-delay-2 mt-5 text-lg leading-relaxed text-muted">
        Sign up, add a connector, then open the dashboard. Full install steps
        are in the docs — Express is the worked example today.
      </p>

      <ol className="mt-16 space-y-12">
        {steps.map((s) => (
          <li key={s.n} className="border-l-2 border-signal/35 pl-5 sm:pl-6">
            <p className="font-mono text-sm tracking-wide text-signal">{s.n}</p>
            <h2 className="mt-2.5 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {s.title}
            </h2>
            <p className="mt-2.5 leading-relaxed text-muted">{s.body}</p>
            {s.cta?.auth ? (
              <button
                type="button"
                onClick={() => openAuth(s.cta.auth)}
                className="text-link mt-3 inline-block cursor-pointer bg-transparent p-0"
              >
                {s.cta.label}
              </button>
            ) : s.cta?.href ? (
              s.cta.href.startsWith('/') ? (
                <Link to={s.cta.href} className="text-link mt-3 inline-block">
                  {s.cta.label}
                </Link>
              ) : (
                <a href={s.cta.href} className="text-link mt-3 inline-block">
                  {s.cta.label}
                </a>
              )
            ) : null}
          </li>
        ))}
      </ol>

      <aside className="mt-16 border border-line bg-surface px-5 py-7 sm:px-7">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          Need install details?
        </h2>
        <p className="mt-2.5 text-[0.975rem] leading-relaxed text-muted">
          The Connect your app guide covers the Express connector, package
          name, env vars, and how to check that endpoints show up in your
          project.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={integratingDocsUrl} className="btn btn-primary">
            Connect your app
          </a>
          <a href={DOCS_URL} className="btn btn-secondary">
            All docs
          </a>
        </div>
      </aside>

      <p className="mt-12 text-[0.95rem] text-muted">
        Want a short overview?{' '}
        <Link to="/how-it-works" className="text-link">
          How it works
        </Link>
      </p>
    </div>
  );
}
