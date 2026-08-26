import { Link } from 'react-router-dom';
import { useAuthModal } from '../context/AuthModalContext';
import { DOCS_URL } from '../lib/urls';

const steps = [
  {
    n: '01',
    title: 'Add a connector',
    body: 'Install a connector for your stack (Express, Nest, FastAPI, Spring, ASP.NET, Nginx/Kong, and more) and set your project API key and API Glimpse URL. It records method, path, status, and field names/types. Sensitive values are removed before data leaves your app.',
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
  { name: 'Fastify', status: 'Available now' },
  { name: 'NestJS', status: 'Available now' },
  { name: 'Next.js', status: 'Available now' },
  { name: 'FastAPI', status: 'Available now' },
  { name: 'Django / Flask', status: 'Available now' },
  { name: 'Go (chi)', status: 'Available now' },
  { name: 'Spring Boot', status: 'Available now' },
  { name: 'ASP.NET Core', status: 'Available now' },
  { name: 'Nginx / Kong', status: 'Available now' },
  { name: 'Node gateway sidecar', status: 'Available now' },
  { name: 'Hono', status: 'Coming soon' },
  { name: 'Envoy', status: 'Coming soon' },
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


const useCases = [
  {
    t: 'Docs vs reality',
    d: 'Compare what your specs promise to the routes traffic actually hit — hit counts and OpenAPI export included.',
  },
  {
    t: 'PII and secrets',
    d: 'Filter inventory for endpoints with sensitive-field signals before auditors ask.',
  },
  {
    t: 'OpenAPI from traffic',
    d: 'Bootstrap a usable OpenAPI document from discovered methods, paths, and schemas.',
  },
  {
    t: 'Multi-service surface',
    d: 'Walk org → project → service to map APIs without opening every codebase.',
  },
  {
    t: 'Auth gaps',
    d: 'Find endpoints where only “none” (or no auth) was observed in real traffic.',
  },
];

export default function HowItWorks() {
  const { openAuth } = useAuthModal();

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


      <section className="mt-20 border-t border-line pt-14">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
          Use cases
        </h2>
        <p className="mt-3 max-w-xl leading-relaxed text-muted">
          Packaging of what the inventory already shows — shadow APIs, sensitive
          fields, and OpenAPI export. Nothing here requires protect mode or
          gateway connectors.
        </p>
        <ul className="mt-10 space-y-8">
          {useCases.map((item) => (
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
        <button type="button" onClick={() => openAuth('register')} className="btn btn-primary">
          Sign up
        </button>
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
