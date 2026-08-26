import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authAPI, invitesAPI } from '../api/api';
import Button from '../components/Button';
import Card from '../components/Card';
import useAuthStore from '../store/authStore';
import { APP_NAME } from '../lib/brand';
import { loginUrl } from '../lib/urls';
import { useActiveOrg } from '../hooks/useActiveOrg';

function statusMessage(status) {
  switch (status) {
    case 'revoked':
      return 'This invite was revoked.';
    case 'accepted':
      return 'This invite was already accepted.';
    case 'expired':
      return 'This invite has expired.';
    case 'pending':
      return null;
    default:
      return 'Invite not found.';
  }
}

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, setUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { setActiveOrgId } = useActiveOrg();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [status, setStatus] = useState(null);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invitesAPI.get(token);
      setStatus(data.status);
      setInvite(data.invite);
    } catch (err) {
      setStatus('not_found');
      setError(err?.message || 'Invite not found');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const emailMatches =
    user?.email &&
    invite?.email &&
    String(user.email).toLowerCase() === String(invite.email).toLowerCase();

  const goAuth = (tab) => {
    navigate(loginUrl(`/invites/${token}`, tab));
  };

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const data = await invitesAPI.accept(token);
      toast.success(
        data.alreadyMember
          ? 'You are already a member'
          : `Joined ${data.organization?.name || 'organization'}`,
      );
      if (data.organization?.id) {
        setActiveOrgId(data.organization.id);
      }
      try {
        const me = await authAPI.me();
        setUser(me.user);
      } catch {
        /* ignore */
      }
      navigate('/projects', { replace: true });
    } catch (err) {
      toast.error(err?.message || 'Could not accept invite');
    } finally {
      setAccepting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <p className="text-sm text-ink-600">Loading invite…</p>
      </div>
    );
  }

  const blocked = statusMessage(status);
  const orgName = invite?.organization?.name || 'an organization';

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <Link to="/" className="font-display text-lg font-bold text-ink-900">
            {APP_NAME}
          </Link>
          {isAuthenticated ? (
            <span className="truncate text-sm text-ink-500">{user?.email}</span>
          ) : (
            <button
              type="button"
              className="cursor-pointer text-sm font-medium text-signal-600 hover:text-signal-800"
              onClick={() => goAuth('login')}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-12">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold text-ink-900">Organization invite</h1>

          {blocked || error ? (
            <p className="mt-4 text-sm text-ink-600">{error || blocked}</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-600">
                You&apos;ve been invited to join <strong className="text-ink-900">{orgName}</strong>
                {invite?.role ? (
                  <>
                    {' '}
                    as a <strong className="text-ink-900">{invite.role}</strong>
                  </>
                ) : null}
                .
              </p>
              <p className="mt-2 text-sm text-ink-500">
                This invite is for <strong className="text-ink-800">{invite?.email}</strong>.
              </p>

              {!isAuthenticated ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button type="button" onClick={() => goAuth('login')}>
                    Sign in to accept
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => goAuth('register')}>
                    Create account
                  </Button>
                </div>
              ) : !emailMatches ? (
                <div className="mt-6 space-y-3">
                  <p className="text-sm text-ink-600">
                    You&apos;re signed in as <strong>{user?.email}</strong>. Switch to{' '}
                    <strong>{invite?.email}</strong> to accept.
                  </p>
                  <Button type="button" variant="secondary" onClick={() => goAuth('login')}>
                    Sign in with the invite email
                  </Button>
                </div>
              ) : (
                <div className="mt-6">
                  <Button type="button" onClick={handleAccept} disabled={accepting}>
                    {accepting ? 'Joining…' : 'Accept invite'}
                  </Button>
                </div>
              )}
            </>
          )}

          <p className="mt-8 text-sm text-ink-500">
            <Link to="/projects" className="font-medium text-signal-600 hover:text-signal-800">
              Back to app
            </Link>
          </p>
        </Card>
      </main>
    </div>
  );
}
