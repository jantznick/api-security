export default function HomePage() {
  return (
    <main>
      <h1>API Glimpse — Next.js demo</h1>
      <p>
        App Router Route Handlers under <code>/api/*</code> are wrapped with{' '}
        <code>@apiglimpse/next</code>.
      </p>
      <ul>
        <li>
          <a href="/api/health">GET /api/health</a>
        </li>
        <li>
          <a href="/api/users">GET /api/users</a>
        </li>
      </ul>
    </main>
  );
}
