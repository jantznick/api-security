import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import useAuthStore from '../store/authStore';

const STORAGE_KEY = 'apiglimpse.activeOrgId';

function readStoredOrgId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredOrgId(orgId) {
  try {
    if (orgId) localStorage.setItem(STORAGE_KEY, orgId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Shared active-org id so header switcher and pages stay in sync.
 * Projects API still returns all memberships; clients filter by activeOrgId.
 */
const useActiveOrgStore = create((set) => ({
  activeOrgId: readStoredOrgId(),
  setActiveOrgId: (orgId) => {
    writeStoredOrgId(orgId);
    set({ activeOrgId: orgId });
  },
}));

/**
 * Light S6 org context: active org in localStorage + Zustand (shared) + header switcher.
 */
export function useActiveOrg() {
  const { user } = useAuthStore();
  const orgs = useMemo(() => (Array.isArray(user?.orgs) ? user.orgs : []), [user?.orgs]);
  const activeOrgId = useActiveOrgStore((s) => s.activeOrgId);
  const setActiveOrgId = useActiveOrgStore((s) => s.setActiveOrgId);

  useEffect(() => {
    if (!orgs.length) return;
    const stillValid = orgs.some((o) => o.id === activeOrgId);
    if (!stillValid) {
      const personal = orgs.find((o) => o.isPersonal) || orgs[0];
      setActiveOrgId(personal.id);
    }
  }, [orgs, activeOrgId, setActiveOrgId]);

  const activeOrg = useMemo(
    () => orgs.find((o) => o.id === activeOrgId) || orgs.find((o) => o.isPersonal) || orgs[0] || null,
    [orgs, activeOrgId],
  );

  return {
    orgs,
    activeOrg,
    activeOrgId: activeOrg?.id || null,
    setActiveOrgId,
  };
}
