-- Snapshot plan limits onto Organization so catalog Plan edits do not cascade
-- to existing orgs/teams (GTM: change Free/Pro without rewriting entitlements).

ALTER TABLE "Organization" ADD COLUMN "endpointLimit" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "seatLimit" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "planAssignedAt" TIMESTAMP(3);

-- Backfill from live Plan by planSlug. Unknown slugs inherit Free defaults.
UPDATE "Organization" AS o
SET
  "endpointLimit" = COALESCE(p."endpointLimit", CASE WHEN o."planSlug" = 'pro' THEN 500 ELSE 25 END),
  "seatLimit" = COALESCE(
    p."seatLimit",
    CASE WHEN o."planSlug" = 'pro' THEN NULL ELSE 3 END
  ),
  "planAssignedAt" = COALESCE(o."planAssignedAt", CURRENT_TIMESTAMP)
FROM "Plan" AS p
WHERE p."slug" = o."planSlug";

-- Orgs whose planSlug has no Plan row yet (should be rare)
UPDATE "Organization"
SET
  "endpointLimit" = COALESCE("endpointLimit", CASE WHEN "planSlug" = 'pro' THEN 500 ELSE 25 END),
  "seatLimit" = CASE
    WHEN "seatLimit" IS NOT NULL THEN "seatLimit"
    WHEN "planSlug" = 'pro' THEN NULL
    ELSE 3
  END,
  "planAssignedAt" = COALESCE("planAssignedAt", CURRENT_TIMESTAMP)
WHERE "planAssignedAt" IS NULL;
