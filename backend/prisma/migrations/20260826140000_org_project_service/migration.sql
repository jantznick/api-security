-- S2: Organization → Project → Service hierarchy
-- Today's "Project" (keys + endpoints) becomes Service; new Project is a grouping.

-- ---------------------------------------------------------------------------
-- 1. Plan seat limits (D11: Free = 3)
-- ---------------------------------------------------------------------------
ALTER TABLE "Plan" ADD COLUMN "seatLimit" INTEGER;

UPDATE "Plan" SET "seatLimit" = 3 WHERE "slug" = 'free';
UPDATE "Plan" SET "seatLimit" = NULL WHERE "slug" = 'pro';

-- ---------------------------------------------------------------------------
-- 2. Optional User.displayName (S0-compatible; nullable)
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT;

-- ---------------------------------------------------------------------------
-- 3. Organization / Membership / OrgInvite / new Project tables
-- ---------------------------------------------------------------------------
CREATE TYPE "OrgRole" AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "planSlug" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");
CREATE INDEX "Organization_planSlug_idx" ON "Organization"("planSlug");

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrgInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'member',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgInvite_tokenHash_key" ON "OrgInvite"("tokenHash");
CREATE INDEX "OrgInvite_organizationId_email_idx" ON "OrgInvite"("organizationId", "email");

ALTER TABLE "OrgInvite"
  ADD CONSTRAINT "OrgInvite_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgInvite"
  ADD CONSTRAINT "OrgInvite_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New Project (grouping). Legacy Project table still exists until renamed below.
CREATE TABLE "Project_new" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_new_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_new_organizationId_idx" ON "Project_new"("organizationId");

ALTER TABLE "Project_new"
  ADD CONSTRAINT "Project_new_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Rename legacy Project → Service (preserve UUIDs = service ids)
-- ---------------------------------------------------------------------------
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_ownerId_fkey";
ALTER TABLE "ApiKey" DROP CONSTRAINT IF EXISTS "ApiKey_projectId_fkey";
ALTER TABLE "Endpoint" DROP CONSTRAINT IF EXISTS "Endpoint_projectId_fkey";

ALTER TABLE "Project" RENAME TO "Service";
ALTER INDEX IF EXISTS "Project_pkey" RENAME TO "Service_pkey";
ALTER INDEX IF EXISTS "Project_ownerId_idx" RENAME TO "Service_ownerId_idx_tmp";

-- ApiKey / Endpoint: projectId → serviceId
ALTER TABLE "ApiKey" RENAME COLUMN "projectId" TO "serviceId";
ALTER INDEX IF EXISTS "ApiKey_projectId_idx" RENAME TO "ApiKey_serviceId_idx";

ALTER TABLE "Endpoint" RENAME COLUMN "projectId" TO "serviceId";
ALTER INDEX IF EXISTS "Endpoint_projectId_idx" RENAME TO "Endpoint_serviceId_idx";
ALTER INDEX IF EXISTS "Endpoint_projectId_method_pathTemplate_key" RENAME TO "Endpoint_serviceId_method_pathTemplate_key";

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Endpoint"
  ADD CONSTRAINT "Endpoint_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Backfill personal orgs + Default projects for every user; attach services
-- ---------------------------------------------------------------------------
ALTER TABLE "Service" ADD COLUMN "projectId" TEXT;

-- Personal org + membership + Default project for every existing user
INSERT INTO "Organization" ("id", "name", "slug", "isPersonal", "stripeCustomerId", "stripeSubscriptionId", "planSlug", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  CASE
    WHEN position('@' in u."email") > 1 THEN split_part(u."email", '@', 1) || '''s workspace'
    ELSE 'Personal workspace'
  END,
  'personal-' || replace(u."id", '-', ''),
  true,
  NULL,
  u."stripeSubscriptionId",
  COALESCE(u."planSlug", 'free'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "Membership" m
  INNER JOIN "Organization" o ON o."id" = m."organizationId"
  WHERE m."userId" = u."id" AND o."isPersonal" = true
);

-- Do not copy User.stripeCustomerId onto org (unique globally; User keeps billing until S5).
-- Mirror planSlug / subscription id only.

INSERT INTO "Membership" ("id", "organizationId", "userId", "role", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  o."id",
  u."id",
  'owner'::"OrgRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
INNER JOIN "Organization" o ON o."slug" = 'personal-' || replace(u."id", '-', '')
WHERE NOT EXISTS (
  SELECT 1 FROM "Membership" m WHERE m."userId" = u."id" AND m."organizationId" = o."id"
);

INSERT INTO "Project_new" ("id", "organizationId", "name", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  o."id",
  'Default',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
WHERE o."isPersonal" = true
  AND NOT EXISTS (
    SELECT 1 FROM "Project_new" p WHERE p."organizationId" = o."id"
  );

-- Attach each legacy service to its owner's personal Default project
UPDATE "Service" s
SET "projectId" = p."id"
FROM "Membership" m
INNER JOIN "Organization" o ON o."id" = m."organizationId" AND o."isPersonal" = true
INNER JOIN "Project_new" p ON p."organizationId" = o."id" AND p."name" = 'Default'
WHERE s."ownerId" = m."userId"
  AND s."projectId" IS NULL;

-- Any orphan services (should be none) get a system personal org via ownerId if still null — drop them if no owner
-- Prefer fail loudly if orphans remain:
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Service" WHERE "projectId" IS NULL) THEN
    RAISE EXCEPTION 'S2 migration: Service rows without projectId after backfill';
  END IF;
END $$;

ALTER TABLE "Service" ALTER COLUMN "projectId" SET NOT NULL;

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project_new"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Service_projectId_idx" ON "Service"("projectId");

-- Drop legacy ownerId
DROP INDEX IF EXISTS "Service_ownerId_idx_tmp";
ALTER TABLE "Service" DROP COLUMN "ownerId";

-- Promote Project_new → Project
ALTER TABLE "Project_new" RENAME TO "Project";
ALTER INDEX IF EXISTS "Project_new_pkey" RENAME TO "Project_pkey";
ALTER INDEX IF EXISTS "Project_new_organizationId_idx" RENAME TO "Project_organizationId_idx";
ALTER TABLE "Project" RENAME CONSTRAINT "Project_new_organizationId_fkey" TO "Project_organizationId_fkey";
ALTER TABLE "Service" DROP CONSTRAINT "Service_projectId_fkey";
ALTER TABLE "Service"
  ADD CONSTRAINT "Service_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
