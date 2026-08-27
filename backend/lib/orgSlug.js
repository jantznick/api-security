/**
 * Pure org-name slug helpers (no DB). Used by createTeamOrganization.
 */

/** Slugify a team org name for Organization.slug (unique). */
export function slugifyOrgName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Normalize a candidate slug to start with a letter (Organization.slug rules).
 */
export function normalizeOrgSlugCandidate(base) {
  let candidate = slugifyOrgName(base);
  if (!candidate || !/^[a-z]/.test(candidate)) {
    candidate = `org-${candidate || 'team'}`.replace(/[^a-z0-9-]+/g, '-').slice(0, 48);
  }
  if (!/^[a-z][a-z0-9_-]{0,47}$/.test(candidate)) {
    candidate = `org-${Date.now().toString(36)}`;
  }
  return candidate;
}
