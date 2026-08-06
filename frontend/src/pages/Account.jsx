import { toast } from 'sonner';
import { authAPI } from '../api/api';
import useAuthStore from '../store/authStore';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import { marketingLoginUrl } from '../lib/urls';

export default function Account() {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch {
      /* ignore */
    }
    logout();
    window.location.assign(marketingLoginUrl());
  };

  const copyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      toast.success('Email copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Account"
        description="Your API Glimpse account details."
      />

      <Card className="mt-8 p-6">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-medium text-ink-500">Email</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-3 text-ink-900">
              <span>{user?.email || '—'}</span>
              {user?.email ? (
                <button
                  type="button"
                  onClick={copyEmail}
                  className="cursor-pointer text-sm font-medium text-signal-600 hover:text-signal-800"
                >
                  Copy
                </button>
              ) : null}
            </dd>
          </div>
          {user?.id ? (
            <div>
              <dt className="font-medium text-ink-500">User ID</dt>
              <dd className="mt-1 font-mono text-ink-700">{user.id}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-8 border-t border-ink-100 pt-6">
          <Button variant="secondary" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </Card>
    </AppLayout>
  );
}
