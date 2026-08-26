import { Link } from 'react-router-dom';
import SurfaceMap from '../components/SurfaceMap';
import { useAuthModal } from '../context/AuthModalContext';
import { APP_HEADLINE, APP_NAME, APP_TAGLINE } from '../lib/brand';
import { DOCS_URL } from '../lib/urls';

const steps = [
  {
    n: '01',
    title: 'Add a connector',
    body: 'Install a connector for Express, Fastify, FastAPI, or Go. Set your API key and API Glimpse URL.',
  },
  {
    n: '02',
    title: 'Use your app',
    body: 'Send a few requests like you normally would. API Glimpse records what gets called.',
  },
  {
    n: '03',
    title: 'Open the dashboard',
    body: 'You’ll see your endpoints, schemas, and field types in your service inventory.',
  },
];

const connectorsAvailable = [
  { name: 'Express' },
  { name: 'Fastify' },
  { name: 'FastAPI' },
  { name: 'Go (chi)' },
];

const connectorsSoon = [
  'NestJS',
  'Next.js',
  'Hono',
  'Proxy / gateway',
];

const whatYouSee = [
  {
    t: 'Your real endpoints',
    d: 'The routes that get hit in production — not only the ones in your docs.',
  },
  {
    t: 'Schemas and field types',
    d: 'Field names and types from real requests, updated as traffic continues.',
  },
  {
    t: 'Sensitive fields',
    d: 'See where emails, tokens, and similar data show up in your API.',
  },
  {
    t: 'Fast setup',
    d: 'Create an account, create a project, add middleware, then open the dashboard.',
  },
];


const useCases = [
  {
    t: 'Docs vs reality',
    d: 'OpenAPI is a wish list. Inventory shows which methods and paths actually got hit — with hit counts you can export.',
  },
  {
    t: 'PII and secrets in payloads',
    d: 'Sensitive-field signals flag where emails, tokens, cards, and similar data appear in request or response shapes.',
  },
  {
    t: 'OpenAPI bootstrap',
    d: 'Turn live traffic into a usable OpenAPI 3.0 export in a day — paths and schemas from what your app served.',
  },
  {
    t: 'Pre-audit surface map',
    d: 'Org → project → service inventory gives a multi-service live map without reading every repo.',
  },
  {
    t: 'Auth coverage gaps',
    d: 'See endpoints that never showed bearer or cookie auth in real traffic — filter “no auth observed” in the dashboard.',
  },
];

const privacyPoints = [
  {
    t: 'Metadata, not payloads',
    d: 'We keep structure and tags. We do not keep long-lived copies of request bodies.',
  },
  {
    t: 'Secrets redacted',
    d: 'Authorization headers, cookies, and similar fields are stripped in your app.',
  },
  {
    t: 'Does not block requests',
    d: 'Sampling runs in the background. If API Glimpse is down, your app still works.',
  },
];

export default function Home() {
  const { openAuth } = useAuthModal();

  return (
    <>
      <section
        className="relative min-h-[min(100svh,920px)] overflow-hidden"
        style={{ background: 'var(--hero-mesh)' }}
      >
        <div className="pointer-events-none absolute inset-0 hero-drift opacity-[0.92]">
          <SurfaceMap className="h-full w-full" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 hero-wash"
          style={{
            background:
              'linear-gradient(108deg, rgba(238,243,240,0.96) 0%, rgba(238,243,240,0.88) 34%, rgba(238,243,240,0.42) 58%, rgba(238,243,240,0.08) 78%, transparent 100%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 atmosphere-dots opacity-40" />

        <div className="page-shell relative z-10 flex min-h-[min(100svh,920px)] flex-col justify-center py-24 sm:py-28">
          <p className="anim-rise font-display text-[clamp(3rem,9vw,6.25rem)] font-extrabold leading-[0.92] tracking-[-0.04em] text-ink">
            {APP_NAME}
          </p>
          <h1 className="anim-rise-delay-1 mt-7 max-w-xl font-display text-[clamp(1.6rem,3.4vw,2.35rem)] font-bold leading-[1.15] tracking-tight text-ink-soft">
            {APP_HEADLINE}
          </h1>
          <p className="anim-rise-delay-2 mt-5 max-w-md text-lg leading-relaxed text-muted sm:text-xl">
            {APP_TAGLINE}
          </p>
          <div className="anim-rise-delay-3 mt-11 flex flex-wrap items-center gap-3 sm:gap-4">
            <button type="button" onClick={() => openAuth('register')} className="btn btn-primary">
              Sign up
            </button>
            <a href={DOCS_URL} className="btn btn-secondary">
              Docs
            </a>
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="page-shell py-20 sm:py-28">
          <p className="section-eyebrow">What you get</p>
          <h2 className="section-title mt-3 max-w-2xl text-3xl sm:text-4xl">
            Know what your API exposes
          </h2>
          <p className="section-lede">
            Docs and OpenAPI files get out of date. API Glimpse shows the
            endpoints and fields that real traffic hits.
          </p>
          <ul className="mt-16 grid gap-x-12 gap-y-12 sm:grid-cols-2">
            {whatYouSee.map((item) => (
              <li key={item.t}>
                <h3 className="font-display text-xl font-bold tracking-tight text-ink">
                  {item.t}
                </h3>
                <p className="mt-2.5 max-w-sm text-[0.975rem] leading-relaxed text-muted">
                  {item.d}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="page-shell py-20 sm:py-28">
          <p className="section-eyebrow">Use cases</p>
          <h2 className="section-title mt-3 max-w-2xl text-3xl sm:text-4xl">
            Five ways teams use API Glimpse today
          </h2>
          <p className="section-lede">
            Same inventory you get after adding a connector — no extra products
            to buy. Shadow routes, sensitive fields, and OpenAPI export are in
            the dashboard now.
          </p>
          <ol className="mt-16 space-y-10">
            {useCases.map((item, i) => (
              <li
                key={item.t}
                className="grid gap-2 border-t border-line pt-10 first:border-t-0 first:pt-0 sm:grid-cols-[5rem_1fr] sm:gap-8"
              >
                <span className="font-mono text-sm tracking-wide text-signal">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold tracking-tight text-ink">
                    {item.t}
                  </h3>
                  <p className="mt-2.5 max-w-xl text-[0.975rem] leading-relaxed text-muted">
                    {item.d}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-14 flex flex-wrap items-center gap-3 sm:gap-4">
            <Link to="/get-started" className="btn btn-primary">
              Get started
            </Link>
            <Link to="/how-it-works" className="text-link">
              How it works →
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="page-shell py-20 sm:py-28">
          <p className="section-eyebrow">How it works</p>
          <h2 className="section-title mt-3 max-w-xl text-3xl sm:text-4xl">
            Three steps
          </h2>
          <ol className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
            {steps.map((s) => (
              <li key={s.n} className="relative">
                <span className="font-mono text-sm tracking-wide text-signal">
                  {s.n}
                </span>
                <h3 className="mt-3 font-display text-xl font-bold tracking-tight text-ink">
                  {s.title}
                </h3>
                <p className="mt-2.5 text-[0.975rem] leading-relaxed text-muted">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-14">
            <Link to="/how-it-works" className="text-link">
              More detail →
            </Link>
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="page-shell py-20 sm:py-28">
          <p className="section-eyebrow">Privacy</p>
          <h2 className="section-title mt-3 max-w-2xl text-3xl sm:text-4xl">
            We store field names and types, not full request bodies
          </h2>
          <p className="section-lede">
            API Glimpse keeps methods, paths, and schema info. We do not store
            full request or response bodies. Secrets like auth headers are
            removed before data leaves your app.
          </p>
          <ul className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {privacyPoints.map((item) => (
              <li key={item.t} className="border-l-2 border-signal/35 pl-5">
                <h3 className="font-display text-lg font-bold tracking-tight text-ink">
                  {item.t}
                </h3>
                <p className="mt-2.5 text-[0.975rem] leading-relaxed text-muted">
                  {item.d}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-12">
            <Link to="/privacy" className="text-link">
              Privacy page →
            </Link>
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-surface-ink text-canvas">
        <div className="page-shell grid gap-14 py-20 sm:py-28 md:grid-cols-2 md:gap-16">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Connectors
            </h2>
            <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-canvas/75">
              Drop a connector into your app. Traffic samples flow to API
              Glimpse so you can see endpoints and fields in the dashboard.
            </p>
            <div className="mt-10 space-y-8">
              <div>
                <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-signal-glow">
                  Available now
                </p>
                <ul className="mt-3 space-y-2">
                  {connectorsAvailable.map((c) => (
                    <li
                      key={c.name}
                      className="text-[1.05rem] leading-relaxed text-canvas/90"
                    >
                      {c.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-canvas/45">
                  Coming soon
                </p>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[0.975rem] text-canvas/70">
                  {connectorsSoon.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-end border-t border-canvas/12 pt-10 md:border-l md:border-t-0 md:pl-14 md:pt-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-signal-glow">
              Get started
            </p>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-canvas/80">
              Create an account, add a project API key, and install a connector.
              Endpoint inventory appears in the dashboard as traffic arrives.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => openAuth('register')}
                className="btn btn-on-dark"
              >
                Create an account
              </button>
              <Link to="/get-started" className="btn btn-ghost-on-dark">
                Setup guide
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
