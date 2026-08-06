import { Link } from 'react-router-dom';
import { DOCS_URL, signupUrl } from '../lib/urls';

const steps = [
  {
    n: '01',
    title: 'Add a connector',
    body: 'Install a connector for your stack (example: Express) and set your project API key and API Glimpse URL. It records method, path, status, and field names/types. Sensitive values are removed before data leaves your app.',
  },
  {
    n: '02',
    title: 'Use your app',
    body: 'Send traffic the way you normally do. API Glimpse receives samples from those requests. There is nothing extra to crawl or schedule.',
  },
  {
    n: '03',
    title: 'Open the dashboard',
    body: 'You’ll see endpoints, schemas, and field types in your project. New traffic keeps updating what you see.',
  },
];

const connectors = [
  { name: 'Express', status: 'Available now' },
  { name: 'Fastify', status: 'Coming soon' },
  { name: 'NestJS', status: 'Coming soon' },
  { name: 'Next.js', status: 'Coming soon' },
  { name: 'Hono', status: 'Coming soon' },
  { name: 'FastAPI', status: 'Coming soon' },
  { name: 'Go (chi)', status: 'Coming soon' },
  { name: 'Proxy / gateway', status: 'Coming soon' },
];

const whatYouGet = [
  {
    t: 'List of endpoints',
    d: 'Methods and paths from real traffic, in your project.',
  },
  {
    t: 'Schemas',
    d: 'Field names and types inferred from requests.',
  },
  {
    t: 'Sensitive field tags',
    d: 'Markers when personal or secret-looking data shows up.',
  },
];

export default function HowItWorks() {
  return (
    <div className="prose-page">
      <p className="section-eyebrow anim-rise">Product</p>
      <h1 className="anim-rise-delay-1 section-title mt-3 text-4xl sm:text-5xl">
        How it works
      </h1>
      <p className="anim-rise-delay-2 mt-5 text-lg leading-relaxed text-muted">
        Add a connector, use your app, then open the dashboard. You’ll see
        endpoints, schemas, and field types from real traffic.
      </p>

      <ol className="mt-16 space-y-14">
        {steps.map((s) => (
          <li key={s.n}>
            <p className="font-mono text-sm tracking-wide text-signal">{s.n}</p>
            <h2 className="mt-2.5 font-display text-2xl font-bold tracking-tight text-ink">
              {s.title}
            </h2>
            <p className="mt-3 leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-20 border-t border-line pt-14">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
          Connectors
        </h2>
        <p className="mt-3 max-w-xl leading-relaxed text-muted">
          Same flow for every stack: connector samples traffic, API Glimpse
          aggregates, you browse the dashboard.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {connectors.map((c) => (
            <li
              key={c.name}
              className="flex items-baseline justify-between gap-4 border-b border-line pb-3"
            >
              <span className="font-display text-base font-semibold tracking-tight text-ink">
                {c.name}
              </span>
              <span
                className={
                  c.status === 'Available now'
                    ? 'shrink-0 text-sm text-signal'
                    : 'shrink-0 text-sm text-muted'
                }
              >
                {c.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20 border-t border-line pt-14">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
          What you get
        </h2>
        <ul className="mt-10 space-y-8">
          {whatYouGet.map((item) => (
            <li key={item.t} className="border-l-2 border-signal/35 pl-5">
              <h3 className="font-display text-lg font-bold tracking-tight text-ink">
                {item.t}
              </h3>
              <p className="mt-1.5 text-[0.975rem] leading-relaxed text-muted">
                {item.d}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-16 flex flex-wrap gap-3 border-t border-line pt-12">
        <Link to={signupUrl} className="btn btn-primary">
          Sign up
        </Link>
        <Link to="/get-started" className="btn btn-secondary">
          Get started
        </Link>
        <a href={DOCS_URL} className="text-link inline-flex items-center px-2 py-3">
          Docs
        </a>
      </div>
    </div>
  );
}
