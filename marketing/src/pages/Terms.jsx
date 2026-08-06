export default function Terms() {
  return (
    <div className="prose-page">
      <h1 className="anim-rise section-title text-4xl sm:text-5xl">
        Terms of service
      </h1>
      <p className="anim-rise-delay-1 mt-3 text-sm text-muted">
        Last updated: August 2026
      </p>

      <div className="legal-prose anim-rise-delay-2 mt-12">
        <section>
          <h2>Agreement</h2>
          <p className="mt-3">
            By creating an account or using API Glimpse, you agree to these
            terms. We may update them; the “Last updated” date above reflects
            the current version.
          </p>
        </section>

        <section>
          <h2>Your responsibilities</h2>
          <ul>
            <li>
              Keep your project API keys and dashboard credentials secure.
            </li>
            <li>
              Only install the middleware on apps you have the right to
              observe.
            </li>
            <li>Do not try to disrupt or overload the service.</li>
          </ul>
        </section>

        <section>
          <h2>The service</h2>
          <p className="mt-3">
            API Glimpse provides API discovery and inventory from sampled
            traffic. If sampling fails, your app should keep running. Projects
            may have endpoint limits configured by the service. We aim for
            reliable dashboard updates but do not guarantee uninterrupted
            availability.
          </p>
        </section>

        <section>
          <h2>Disclaimer</h2>
          <p className="mt-3">
            The service is provided “as is” without warranties of any kind. To
            the fullest extent permitted by law, we are not liable for indirect
            or consequential damages from use of the product.
          </p>
        </section>
      </div>
    </div>
  );
}
