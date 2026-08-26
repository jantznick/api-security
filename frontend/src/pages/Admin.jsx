import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { adminAPI } from '../api/api';
import useAuthStore from '../store/authStore';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';

function emptyDraft(plan) {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name ?? '',
    endpointLimit:
      plan.endpointLimit === null || plan.endpointLimit === undefined
        ? ''
        : String(plan.endpointLimit),
    priceCentsMonthly: String(plan.priceCentsMonthly ?? 0),
    stripePriceId: plan.stripePriceId ?? '',
    active: plan.active !== false,
    sortOrder: String(plan.sortOrder ?? 0),
  };
}

export default function Admin() {
  const { user, isLoading } = useAuthStore();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminAPI.listPlans();
      setDrafts((data.plans || []).map(emptyDraft));
    } catch (err) {
      toast.error(err.message || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) load();
  }, [user?.isAdmin, load]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <p className="text-sm text-ink-600">Loading…</p>
      </div>
    );
  }

  if (!user?.isAdmin) {
    return <Navigate to="/projects" replace />;
  }

  const updateDraft = (index, patch) => {
    setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const plans = drafts.map((d) => ({
        id: d.id || undefined,
        slug: d.slug.trim().toLowerCase(),
        name: d.name.trim(),
        endpointLimit: d.endpointLimit === '' ? null : Number(d.endpointLimit),
        priceCentsMonthly: Number(d.priceCentsMonthly || 0),
        stripePriceId: d.stripePriceId.trim() || null,
        active: Boolean(d.active),
        sortOrder: Number(d.sortOrder || 0),
      }));
      const data = await adminAPI.updatePlans(plans);
      setDrafts((data.plans || []).map(emptyDraft));
      toast.success('Plans saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save plans');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Admin — Plans"
        description="Configure plan names, per-project endpoint limits, and Stripe prices. Limits apply to each of a user's projects when their plan changes."
        actions={
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save plans'}
          </Button>
        }
      />

      {loading ? (
        <p className="mt-8 text-sm text-ink-500">Loading plans…</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-ink-500">
                <th className="py-2 pr-3 font-medium">Slug</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Endpoint limit</th>
                <th className="py-2 pr-3 font-medium">Price (¢/mo)</th>
                <th className="py-2 pr-3 font-medium">Stripe price id</th>
                <th className="py-2 pr-3 font-medium">Active</th>
                <th className="py-2 font-medium">Sort</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((row, index) => (
                <tr key={row.id || row.slug} className="border-b border-ink-100">
                  <td className="py-2 pr-3">
                    <span className="font-mono text-ink-700">{row.slug}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-full min-w-[6rem] rounded-md border border-ink-200 bg-white px-2 py-1.5 text-ink-900"
                      value={row.name}
                      onChange={(e) => updateDraft(index, { name: e.target.value })}
                      aria-label={`Name for ${row.slug}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min="0"
                      placeholder="∞"
                      className="w-24 rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-ink-900"
                      value={row.endpointLimit}
                      onChange={(e) => updateDraft(index, { endpointLimit: e.target.value })}
                      aria-label={`Endpoint limit for ${row.slug}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min="0"
                      className="w-28 rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-ink-900"
                      value={row.priceCentsMonthly}
                      onChange={(e) => updateDraft(index, { priceCentsMonthly: e.target.value })}
                      aria-label={`Price cents for ${row.slug}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-full min-w-[10rem] rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-xs text-ink-900"
                      value={row.stripePriceId}
                      onChange={(e) => updateDraft(index, { stripePriceId: e.target.value })}
                      placeholder="price_…"
                      aria-label={`Stripe price id for ${row.slug}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e) => updateDraft(index, { active: e.target.checked })}
                      aria-label={`Active ${row.slug}`}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      className="w-16 rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-ink-900"
                      value={row.sortOrder}
                      onChange={(e) => updateDraft(index, { sortOrder: e.target.value })}
                      aria-label={`Sort order for ${row.slug}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-500">
            Empty endpoint limit = unlimited. Price is display/admin only until Checkout uses{' '}
            <code className="font-mono">stripePriceId</code> (or env <code className="font-mono">STRIPE_PRICE_PRO</code>).
          </p>
        </div>
      )}
    </AppLayout>
  );
}
