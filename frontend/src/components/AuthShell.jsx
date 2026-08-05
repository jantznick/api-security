import { Link } from 'react-router-dom';
import { APP_NAME } from '../lib/brand';

export default function AuthShell({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-ink-100 via-ink-50 to-white">
      <header className="px-4 py-6 text-center">
        <Link to="/" className="text-xl font-semibold tracking-tight text-ink-900">
          {APP_NAME}
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">{children}</div>
    </div>
  );
}
