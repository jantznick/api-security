export default function Privacy() {
  return (
    <div className="prose-page">
      <h1 className="anim-rise section-title text-4xl sm:text-5xl">Privacy</h1>
      <p className="anim-rise-delay-1 mt-3 text-sm text-muted">
        Last updated: August 2026
      </p>

      <div className="legal-prose anim-rise-delay-2 mt-12">
        <section>
          <h2>Summary</h2>
          <p className="mt-3">
            API Glimpse helps you see endpoints and field types from real
            traffic. We do not store full request or response bodies in our
            database.
          </p>
        </section>

        <section>
          <h2>What we look at</h2>
          <p className="mt-3">
            Connectors in your app sample method, path, status, and body field
            names and types. Sensitive headers such as authorization and cookies
            are removed before data leaves your app. Samples are used briefly,
            then discarded.
          </p>
        </section>

        <section>
          <h2>What we keep</h2>
          <ul>
            <li>Account and project information you provide</li>
            <li>API key hashes (not the raw key after you create it)</li>
            <li>Endpoints: methods, path templates, counts, latency stats</li>
            <li>Inferred schemas and tags</li>
            <li>Session data for dashboard sign-in</li>
          </ul>
        </section>

        <section>
          <h2>Retention</h2>
          <p className="mt-3">
            Endpoint data and account data stay while your project is active.
            Contact us if you need a project or account deleted.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p className="mt-3">
            Privacy questions:{' '}
            <a href="https://apiglimpse.com" className="text-link">
              apiglimpse.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
