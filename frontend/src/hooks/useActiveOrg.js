import { useCallback, useEffect, useMemo, useState } from 'react';
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
 * Light S6 org context: active org in localStorage + header switcher.
 * Projects API still returns all memberships; clients may filter by activeOrgId.
 */
export function useActiveOrg() {
  const { user } = useAuthStore();
  const orgs = useMemo(() => (Array.isArray(user?.orgs) ? user.orgs : []), [user?.orgs]);
  const [activeOrgId, setActiveOrgIdState] = useState(() => readStoredOrgId());

  useEffect(() => {
    if (!orgs.length) return;
    const stillValid = orgs.some((o) => o.id === activeOrgId);
    if (!stillValid) {
      const personal = orgs.find((o) => o.isPersonal) || orgs[0];
      setActiveOrgIdState(personal.id);
      writeStoredOrgId(personal.id);
    }
  }, [orgs, activeOrgId]);

  const setActiveOrgId = useCallback((orgId) => {
    setActiveOrgIdState(orgId);
    writeStoredOrgId(orgId);
  }, []);

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
