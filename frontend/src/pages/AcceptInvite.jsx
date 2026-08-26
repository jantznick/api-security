import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authAPI, invitesAPI } from '../api/api';
import Button from '../components/Button';
import Card from '../components/Card';
import useAuthStore from '../store/authStore';
import { APP_NAME } from '../lib/brand';
import { useActiveOrg } from '../hooks/useActiveOrg';

function statusMessage(status) {
  switch (status) {
    case 'revoked':
      return 'This invite was revoked.';
    case 'expired':
      return 'This invite has expired.';
    case 'not_found':
      return 'Invite not found.';
    default:
      return null;
  }
}

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, setUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { setActiveOrgId } = useActiveOrg();
  const [phase, setPhase] = useState('loading'); // loading | redeeming | mismatch | error | ready
  const [status, setStatus] = useState(null);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [mismatch, setMismatch] = useState(null);
  const redeemStarted = useRef(false);

  const finishJoin = useCallback(
    async (data) => {
      toast.success(
        data.alreadyMember
          ? 'You are already a member'
          : `Joined ${data.organization?.name || 'organization'}`,
      );
      if (data.organization?.id) {
        setActiveOrgId(data.organization.id);
      }
      if (data.user) {
        setUser(data.user);
      }
      try {
        const me = await authAPI.me();
        setUser(me.user);
      } catch {
        /* ignore */
      }
      navigate('/projects', { replace: true });
    },
    [navigate, setActiveOrgId, setUser],
  );

  useEffect(() => {
    if (authLoading) return undefined;
    if (redeemStarted.current) return undefined;
    if (!token) {
      setStatus('not_found');
      setError('Invite not found');
      setPhase('error');
      return undefined;
    }

    let cancelled = false;
    const sessionEmailAtBoot = user?.email || null;

    async function boot() {
      setPhase('loading');
      setError(null);
      setMismatch(null);

      try {
        const data = await invitesAPI.get(token);
        if (cancelled) return;

        setStatus(data.status);
        setInvite(data.invite);

        if (data.status === 'revoked' || data.status === 'expired' || data.status === 'not_found') {
          setPhase('error');
          return;
        }

        const sessionEmail = sessionEmailAtBoot || data.authenticatedEmail;
        const inviteEmail = data.invite?.email;
        if (
          sessionEmail &&
          inviteEmail &&
          String(sessionEmail).toLowerCase() !== String(inviteEmail).toLowerCase()
        ) {
          setMismatch({
            sessionEmail,
            expectedEmail: inviteEmail,
            message: `You're signed in as ${sessionEmail}. Sign out, or open this invite in a private window, to join as ${inviteEmail}.`,
          });
          setPhase('mismatch');
          return;
        }

        redeemStarted.current = true;
        setPhase('redeeming');

        try {
          const result = await invitesAPI.redeem(token);
          if (cancelled) return;
          await finishJoin(result);
        } catch (err) {
          if (cancelled) return;
          redeemStarted.current = false;
          if (err?.status === 403) {
            setMismatch({
              sessionEmail: sessionEmailAtBoot || sessionEmail,
              expectedEmail: inviteEmail,
              message: err.message,
            });
            setPhase('mismatch');
          } else {
            setError(err?.message || 'Could not accept invite');
            toast.error(err?.message || 'Could not accept invite');
            setPhase('error');
          }
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('not_found');
        setError(err?.message || 'Invite not found');
        setPhase('error');
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
    // Intentionally omit user from deps — capture email once auth boot completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading, finishJoin]);

  const handleSignOutAndRetry = async () => {
    try {
      setPhase('redeeming');
      await authAPI.logout();
      setUser(null);
      redeemStarted.current = true;
      setMismatch(null);
      const data = await invitesAPI.redeem(token);
      await finishJoin(data);
    } catch (err) {
      redeemStarted.current = false;
      toast.error(err?.message || 'Could not switch accounts');
      setError(err?.message || 'Could not switch accounts');
      setPhase('error');
    }
  };

  const handleManualRedeem = async () => {
    setPhase('redeeming');
    setError(null);
    try {
      redeemStarted.current = true;
      const data = await invitesAPI.redeem(token);
      await finishJoin(data);
    } catch (err) {
      redeemStarted.current = false;
      if (err?.status === 403) {
        setMismatch({
          sessionEmail: user?.email,
          expectedEmail: invite?.email,
          message: err.message,
        });
        setPhase('mismatch');
      } else {
        setError(err?.message || 'Could not accept invite');
        toast.error(err?.message || 'Could not accept invite');
        setPhase('error');
      }
    }
  };

  if (authLoading || phase === 'loading' || phase === 'redeeming') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <p className="text-sm text-ink-600">
          {phase === 'redeeming' ? 'Joining organization…' : 'Loading invite…'}
        </p>
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
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-12">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold text-ink-900">Organization invite</h1>

          {phase === 'mismatch' && mismatch ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-ink-600">{mismatch.message}</p>
              <p className="text-sm text-ink-500">
                Sign out to accept as the invited email, or open the invite link in a private
                window.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={handleSignOutAndRetry}>
                  Sign out and join
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate('/projects')}>
                  Stay signed in
                </Button>
              </div>
            </div>
          ) : phase === 'error' || blocked ? (
            <p className="mt-4 text-sm text-ink-600">{error || blocked}</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-600">
                You&apos;ve been invited to join <strong className="text-ink-900">{orgName}</strong>
                {invite?.roleName || invite?.role ? (
                  <>
                    {' '}
                    as a{' '}
                    <strong className="text-ink-900">
                      {invite.roleName || invite.role}
                    </strong>
                  </>
                ) : null}
                .
              </p>
              <p className="mt-2 text-sm text-ink-500">
                This invite is for <strong className="text-ink-800">{invite?.email}</strong>.
              </p>
              <div className="mt-6">
                <Button type="button" onClick={handleManualRedeem}>
                  Accept invite
                </Button>
              </div>
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
