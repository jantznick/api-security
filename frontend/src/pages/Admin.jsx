import { useCallback, useEffect, useMemo, useState } from 'react';
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
    description: plan.description ?? '',
    endpointLimit:
      plan.endpointLimit === null || plan.endpointLimit === undefined
        ? ''
        : String(plan.endpointLimit),
    priceCentsMonthly: String(plan.priceCentsMonthly ?? 0),
    stripePriceId: plan.stripePriceId ?? '',
    contactSales: Boolean(plan.contactSales),
    contactUrl: plan.contactUrl ?? '',
    active: plan.active !== false,
    sortOrder: String(plan.sortOrder ?? 0),
    /** New rows without a DB id can edit slug until first save */
    slugEditable: !plan.id,
  };
}

function newPlanDraft({ slug, name, contactSales = false, ...rest } = {}) {
  const baseSlug = (slug || 'new-plan').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return emptyDraft({
    id: null,
    slug: baseSlug,
    name: name || 'New plan',
    description: rest.description ?? '',
    endpointLimit: rest.endpointLimit ?? '',
    priceCentsMonthly: rest.priceCentsMonthly ?? 0,
    stripePriceId: '',
    contactSales,
    contactUrl: rest.contactUrl ?? '',
    active: true,
    sortOrder: rest.sortOrder ?? 100,
  });
}

function formatMoney(cents) {
  const n = Number(cents) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n % 100 === 0 ? 0 : 2,
  }).format(n / 100);
}

function formatInt(n) {
  return new Intl.NumberFormat('en-US').format(Number(n) || 0);
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Kpi({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900 tabular-nums sm:text-3xl">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

function Section({ title, description, children, actions }) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
        </div>
        {actions || null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SignupChart({ series }) {
  const max = Math.max(1, ...(series || []).map((d) => d.count));
  if (!series?.length) {
    return <p className="text-sm text-ink-500">No signup data yet.</p>;
  }

  return (
    <div>
      <div
        className="flex h-36 items-end gap-px sm:gap-0.5"
        role="img"
        aria-label="Daily signups over the last 30 days"
      >
        {series.map((day) => {
          const heightPct = Math.max(day.count > 0 ? 8 : 2, (day.count / max) * 100);
          return (
            <div
              key={day.date}
              className="group relative flex min-w-0 flex-1 flex-col justify-end"
              title={`${day.date}: ${day.count}`}
            >
              <div
                className={`w-full rounded-t-sm transition-colors ${
                  day.count > 0 ? 'bg-signal-600 group-hover:bg-signal-700' : 'bg-ink-100'
                }`}
                style={{ height: `${heightPct}%` }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                {day.date}: {day.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-400">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function StatusPill({ ok, yes = 'Yes', no = 'No' }) {
  return (
    <span
      className={`inline-flex items-center text-xs font-medium ${
        ok ? 'text-signal-700' : 'text-ink-400'
      }`}
    >
      {ok ? yes : no}
    </span>
  );
}

export default function Admin() {
  const { user, isLoading } = useAuthStore();
  const [overview, setOverview] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [leads, setLeads] = useState([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [userQuery, setUserQuery] = useState('');
  const [userPlanFilter, setUserPlanFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigningUserId, setAssigningUserId] = useState(null);

  const loadOverviewAndPlans = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewData, plansData] = await Promise.all([
        adminAPI.overview(),
        adminAPI.listPlans(),
      ]);
      setOverview(overviewData);
      setDrafts((plansData.plans || []).map(emptyDraft));
    } catch (err) {
      toast.error(err.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async ({ q = '', plan = '', offset = 0 } = {}) => {
    setUsersLoading(true);
    try {
      const data = await adminAPI.listUsers({ q, plan, limit: 50, offset });
      setUsers(data.users || []);
      setUsersTotal(data.total ?? 0);
    } catch (err) {
      toast.error(err.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const data = await adminAPI.listLeads({ limit: 100 });
      setLeads(data.leads || []);
      setLeadsTotal(data.total ?? 0);
    } catch (err) {
      toast.error(err.message || 'Failed to load leads');
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) {
      loadOverviewAndPlans();
      loadUsers();
      loadLeads();
    }
  }, [user?.isAdmin, loadOverviewAndPlans, loadUsers, loadLeads]);

  const planFilterOptions = useMemo(() => {
    const fromOverview = (overview?.plans || []).map((p) => p.slug);
    const fromDrafts = drafts.map((d) => d.slug);
    return [...new Set([...fromOverview, ...fromDrafts])].filter(Boolean).sort();
  }, [overview, drafts]);

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
        description: d.description.trim() || null,
        endpointLimit: d.endpointLimit === '' ? null : Number(d.endpointLimit),
        priceCentsMonthly: Number(d.priceCentsMonthly || 0),
        stripePriceId: d.contactSales ? null : d.stripePriceId.trim() || null,
        contactSales: Boolean(d.contactSales),
        contactUrl: d.contactUrl.trim() || null,
        active: Boolean(d.active),
        sortOrder: Number(d.sortOrder || 0),
      }));
      const data = await adminAPI.updatePlans(plans);
      setDrafts((data.plans || []).map(emptyDraft));
      toast.success('Plans saved');
      const overviewData = await adminAPI.overview();
      setOverview(overviewData);
    } catch (err) {
      toast.error(err.message || 'Failed to save plans');
    } finally {
      setSaving(false);
    }
  };

  const addPlanRow = (preset) => {
    setDrafts((prev) => {
      const existing = new Set(prev.map((p) => p.slug));
      let slug = preset?.slug || 'new-plan';
      if (existing.has(slug)) {
        let n = 2;
        while (existing.has(`${slug}-${n}`)) n += 1;
        slug = `${slug}-${n}`;
      }
      return [...prev, newPlanDraft({ ...preset, slug })];
    });
  };

  const handleAssignPlan = async (userId, planSlug) => {
    if (!planSlug) return;
    setAssigningUserId(userId);
    try {
      await adminAPI.assignUserPlan(userId, planSlug);
      toast.success(`Assigned ${planSlug}`);
      await loadUsers({ q: userQuery, plan: userPlanFilter });
      const overviewData = await adminAPI.overview();
      setOverview(overviewData);
    } catch (err) {
      toast.error(err.message || 'Failed to assign plan');
    } finally {
      setAssigningUserId(null);
    }
  };

  const handleUserSearch = (e) => {
    e.preventDefault();
    loadUsers({ q: userQuery, plan: userPlanFilter, offset: 0 });
  };

  const accounts = overview?.accounts;
  const revenue = overview?.revenue;
  const usage = overview?.usage;

  return (
    <AppLayout>
      <PageHeader
        title="Admin"
        description="Platform pulse — accounts, orgs, revenue, and product usage. Billing is still per user until org billing (S5)."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              loadOverviewAndPlans();
              loadUsers({ q: userQuery, plan: userPlanFilter });
              loadLeads();
            }}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      {loading && !overview ? (
        <p className="mt-8 text-sm text-ink-500">Loading overview…</p>
      ) : (
        <>
          <Section title="At a glance" description="Core SaaS health for owners.">
            <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-ink-200 py-6 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi
                label="Users"
                value={formatInt(accounts?.totalUsers)}
                hint={`+${formatInt(accounts?.newUsers7d)} this week`}
              />
              <Kpi
                label="Paid"
                value={formatInt(accounts?.paidUsers)}
                hint={`${formatInt(accounts?.subscribedUsers)} with Stripe sub`}
              />
              <Kpi
                label="MRR"
                value={formatMoney(revenue?.mrrCents)}
                hint={`${formatMoney(revenue?.arrCents)} ARR est.`}
              />
              <Kpi
                label="Services"
                value={formatInt(usage?.totalServices ?? usage?.totalProjects)}
                hint={`${formatInt(accounts?.organizations)} orgs · ${formatInt(usage?.totalProjects)} projects`}
              />
              <Kpi
                label="Endpoints"
                value={formatInt(usage?.totalEndpoints)}
                hint={`${formatInt(usage?.totalHits)} hits observed`}
              />
              <Kpi
                label="Signals"
                value={formatInt(usage?.totalSignals)}
                hint={`${formatInt(usage?.activeApiKeys)} live API keys`}
              />
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Tenancy is Organization → Project → Service. Billing remains per user until org billing
              (S5). {revenue?.note}
            </p>
          </Section>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <Section
              title="Signups"
              description="New accounts per day (last 30 days, UTC)."
            >
              <SignupChart series={overview?.signupsByDay} />
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-ink-500">Last 7 days</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-ink-900">
                    {formatInt(accounts?.newUsers7d)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Last 30 days</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-ink-900">
                    {formatInt(accounts?.newUsers30d)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Stripe customers</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-ink-900">
                    {formatInt(accounts?.stripeCustomers)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">No projects yet</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-ink-900">
                    {formatInt(accounts?.usersWithoutProjects)}
                  </dd>
                </div>
              </dl>
            </Section>

            <Section title="Plan mix" description="Users and estimated MRR by plan.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-ink-500">
                      <th className="py-2 pr-3 font-medium">Plan</th>
                      <th className="py-2 pr-3 font-medium">Users</th>
                      <th className="py-2 pr-3 font-medium">Price</th>
                      <th className="py-2 font-medium">MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.plans || []).map((plan) => (
                      <tr key={plan.slug} className="border-b border-ink-100">
                        <td className="py-2.5 pr-3">
                          <span className="font-medium text-ink-900">{plan.name}</span>
                          <span className="ml-2 font-mono text-xs text-ink-400">{plan.slug}</span>
                          {!plan.active ? (
                            <span className="ml-2 text-xs text-warn-700">inactive</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums">{formatInt(plan.userCount)}</td>
                        <td className="py-2.5 pr-3 tabular-nums">
                          {formatMoney(plan.priceCentsMonthly)}
                          <span className="text-ink-400">/mo</span>
                        </td>
                        <td className="py-2.5 tabular-nums font-medium">
                          {formatMoney(plan.mrrCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>

          <Section title="Platform usage" description="Inventory and ingest activity across all projects.">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {[
                { label: 'Organizations', value: accounts?.organizations },
                { label: 'Projects', value: usage?.totalProjects },
                { label: 'Services', value: usage?.totalServices },
                { label: 'Discovered endpoints', value: usage?.totalEndpoints },
                { label: 'Total traffic hits', value: usage?.totalHits },
                { label: 'Security signals', value: usage?.totalSignals },
                { label: 'API keys (active)', value: usage?.activeApiKeys },
                { label: 'API keys (revoked)', value: usage?.revokedApiKeys },
                { label: 'Free users', value: accounts?.freeUsers },
                { label: 'Paid users', value: accounts?.paidUsers },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
                    {formatInt(item.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section
            title="Sales leads"
            description={`${formatInt(leadsTotal)} contact-sales inquiries — who filled out the form.`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Company</th>
                    <th className="py-2 pr-3 font-medium">Plan</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-ink-500">
                        {leadsLoading
                          ? 'Loading leads…'
                          : 'No inquiries yet. They’ll show up when someone submits Contact sales.'}
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-ink-100 align-top">
                        <td className="whitespace-nowrap py-2.5 pr-3 text-ink-600">
                          {formatDate(lead.createdAt)}
                        </td>
                        <td className="py-2.5 pr-3 font-medium text-ink-900">{lead.name}</td>
                        <td className="py-2.5 pr-3">
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-signal-600 hover:text-signal-800"
                          >
                            {lead.email}
                          </a>
                        </td>
                        <td className="py-2.5 pr-3 text-ink-700">{lead.company || '—'}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs text-ink-700">
                          {lead.planSlug || '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-ink-600">{lead.source || '—'}</td>
                        <td className="max-w-xs py-2.5 text-ink-600">
                          {lead.message ? (
                            <span className="line-clamp-3 whitespace-pre-wrap">{lead.message}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Users"
            description={`${formatInt(usersTotal)} accounts — search and filter by plan.`}
          >
            <form
              onSubmit={handleUserSearch}
              className="flex flex-wrap items-end gap-3"
            >
              <label className="min-w-[12rem] flex-1 text-sm">
                <span className="mb-1 block text-ink-500">Email</span>
                <input
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-900"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Search email…"
                  aria-label="Search users by email"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-ink-500">Plan</span>
                <select
                  className="rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-900"
                  value={userPlanFilter}
                  onChange={(e) => setUserPlanFilter(e.target.value)}
                  aria-label="Filter by plan"
                >
                  <option value="">All</option>
                  {planFilterOptions.map((slug) => (
                    <option key={slug} value={slug}>
                      {slug}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={usersLoading}>
                {usersLoading ? 'Searching…' : 'Search'}
              </Button>
            </form>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Plan</th>
                    <th className="py-2 pr-3 font-medium">Services</th>
                    <th className="py-2 pr-3 font-medium">Stripe</th>
                    <th className="py-2 pr-3 font-medium">Sub</th>
                    <th className="py-2 pr-3 font-medium">Joined</th>
                    <th className="py-2 font-medium">Assign plan</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-ink-500">
                        {usersLoading ? 'Loading users…' : 'No users match.'}
                      </td>
                    </tr>
                  ) : (
                    users.map((row) => (
                      <tr key={row.id} className="border-b border-ink-100">
                        <td className="py-2.5 pr-3 font-medium text-ink-900">{row.email}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs text-ink-700">
                          {row.planSlug}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums">
                          {row.serviceCount ?? row.projectCount}
                        </td>
                        <td className="py-2.5 pr-3">
                          <StatusPill ok={row.hasStripeCustomer} />
                        </td>
                        <td className="py-2.5 pr-3">
                          <StatusPill ok={row.hasSubscription} />
                        </td>
                        <td className="py-2.5 pr-3 text-ink-600">{formatDate(row.createdAt)}</td>
                        <td className="py-2.5">
                          <select
                            className="rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-xs text-ink-900"
                            value={row.planSlug}
                            disabled={assigningUserId === row.id}
                            onChange={(e) => handleAssignPlan(row.id, e.target.value)}
                            aria-label={`Assign plan for ${row.email}`}
                          >
                            {planFilterOptions.map((slug) => (
                              <option key={slug} value={slug}>
                                {slug}
                              </option>
                            ))}
                            {!planFilterOptions.includes(row.planSlug) ? (
                              <option value={row.planSlug}>{row.planSlug}</option>
                            ) : null}
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      <Section
        title="Plan configuration"
        description="Add self-serve or contact-sales plans. Contact-sales plans skip Stripe Checkout and show a Contact CTA. After a sales chat, assign the plan on a user below (or in Users)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                addPlanRow({
                  slug: 'new-plan',
                  name: 'New plan',
                  endpointLimit: 1000,
                  priceCentsMonthly: 0,
                  sortOrder: 50,
                })
              }
              disabled={saving}
            >
              Add plan
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                addPlanRow({
                  slug: 'enterprise',
                  name: 'Enterprise',
                  description:
                    'Custom limits, dedicated support, and onboarding. Contact us for pricing.',
                  endpointLimit: '',
                  priceCentsMonthly: 0,
                  contactSales: true,
                  sortOrder: 100,
                })
              }
              disabled={saving || drafts.some((d) => d.slug === 'enterprise')}
            >
              Add Enterprise
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save plans'}
            </Button>
          </div>
        }
      >
        {loading && drafts.length === 0 ? (
          <p className="text-sm text-ink-500">Loading plans…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-2 pr-3 font-medium">Slug</th>
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 font-medium">Endpoint limit</th>
                    <th className="py-2 pr-3 font-medium">Price (¢/mo)</th>
                    <th className="py-2 pr-3 font-medium">Contact sales</th>
                    <th className="py-2 pr-3 font-medium">Contact URL</th>
                    <th className="py-2 pr-3 font-medium">Stripe price id</th>
                    <th className="py-2 pr-3 font-medium">Active</th>
                    <th className="py-2 font-medium">Sort</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((row, index) => (
                    <tr key={row.id || `draft-${row.slug}-${index}`} className="border-b border-ink-100 align-top">
                      <td className="py-2 pr-3">
                        {row.slugEditable ? (
                          <input
                            className="w-28 rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-xs text-ink-900"
                            value={row.slug}
                            onChange={(e) =>
                              updateDraft(index, {
                                slug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                              })
                            }
                            aria-label="Plan slug"
                          />
                        ) : (
                          <span className="font-mono text-ink-700">{row.slug}</span>
                        )}
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
                          className="w-full min-w-[10rem] rounded-md border border-ink-200 bg-white px-2 py-1.5 text-ink-900"
                          value={row.description}
                          onChange={(e) =>
                            updateDraft(index, { description: e.target.value })
                          }
                          placeholder="Optional blurb"
                          aria-label={`Description for ${row.slug}`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="0"
                          placeholder="∞"
                          className="w-24 rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-ink-900"
                          value={row.endpointLimit}
                          onChange={(e) =>
                            updateDraft(index, { endpointLimit: e.target.value })
                          }
                          aria-label={`Endpoint limit for ${row.slug}`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="0"
                          className="w-28 rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-ink-900"
                          value={row.priceCentsMonthly}
                          onChange={(e) =>
                            updateDraft(index, { priceCentsMonthly: e.target.value })
                          }
                          disabled={row.contactSales}
                          aria-label={`Price cents for ${row.slug}`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={row.contactSales}
                          onChange={(e) =>
                            updateDraft(index, {
                              contactSales: e.target.checked,
                              stripePriceId: e.target.checked ? '' : row.stripePriceId,
                              priceCentsMonthly: e.target.checked
                                ? '0'
                                : row.priceCentsMonthly,
                            })
                          }
                          aria-label={`Contact sales ${row.slug}`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          className="w-full min-w-[10rem] rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-xs text-ink-900"
                          value={row.contactUrl}
                          onChange={(e) =>
                            updateDraft(index, { contactUrl: e.target.value })
                          }
                          placeholder="mailto:… or https://…"
                          disabled={!row.contactSales}
                          aria-label={`Contact URL for ${row.slug}`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          className="w-full min-w-[10rem] rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-xs text-ink-900"
                          value={row.stripePriceId}
                          onChange={(e) =>
                            updateDraft(index, { stripePriceId: e.target.value })
                          }
                          placeholder="price_…"
                          disabled={row.contactSales}
                          aria-label={`Stripe price id for ${row.slug}`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={row.active}
                          onChange={(e) =>
                            updateDraft(index, { active: e.target.checked })
                          }
                          aria-label={`Active ${row.slug}`}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          className="w-16 rounded-md border border-ink-200 bg-white px-2 py-1.5 font-mono text-ink-900"
                          value={row.sortOrder}
                          onChange={(e) =>
                            updateDraft(index, { sortOrder: e.target.value })
                          }
                          aria-label={`Sort order for ${row.slug}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Empty endpoint limit = unlimited. Contact-sales plans never open Checkout; their CTA
              opens an in-app form and leads appear under Sales leads above. Self-serve paid plans
              need a <code className="font-mono">stripePriceId</code>.
            </p>
          </>
        )}
      </Section>
    </AppLayout>
  );
}
