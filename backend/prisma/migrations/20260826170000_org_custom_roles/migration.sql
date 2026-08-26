-- Custom org roles: OrgRoleDefinition + optional customRoleId on Membership / OrgInvite

CREATE TABLE "OrgRoleDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgRoleDefinition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrgRoleDefinition_organizationId_idx" ON "OrgRoleDefinition"("organizationId");

-- Global system templates: unique key when organizationId IS NULL
CREATE UNIQUE INDEX "OrgRoleDefinition_system_key_key"
  ON "OrgRoleDefinition"("key")
  WHERE "organizationId" IS NULL;

-- Per-org custom roles: unique (org, key)
CREATE UNIQUE INDEX "OrgRoleDefinition_organizationId_key_key"
  ON "OrgRoleDefinition"("organizationId", "key")
  WHERE "organizationId" IS NOT NULL;

ALTER TABLE "OrgRoleDefinition"
  ADD CONSTRAINT "OrgRoleDefinition_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed global system role templates (permissions mirrored in backend/lib/permissions.js)
INSERT INTO "OrgRoleDefinition" ("id", "organizationId", "key", "name", "description", "isSystem", "permissions", "createdAt", "updatedAt")
VALUES
  (
    'sys-role-owner',
    NULL,
    'owner',
    'Owner',
    'Full control including ownership transfer and billing',
    true,
    '["org.manage_members","org.manage_roles","org.manage_settings","org.manage_billing","project.create","project.manage","service.create","service.manage","service.manage_keys","inventory.read","inventory.export"]'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sys-role-admin',
    NULL,
    'admin',
    'Admin',
    'Manage members, roles, and all project/service work',
    true,
    '["org.manage_members","org.manage_roles","org.manage_settings","project.create","project.manage","service.create","service.manage","service.manage_keys","inventory.read","inventory.export"]'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sys-role-member',
    NULL,
    'member',
    'Member',
    'Create and manage projects, services, and keys',
    true,
    '["project.create","project.manage","service.create","service.manage","service.manage_keys","inventory.read","inventory.export"]'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'sys-role-viewer',
    NULL,
    'viewer',
    'Viewer',
    'Read-only inventory access',
    true,
    '["inventory.read","inventory.export"]'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

ALTER TABLE "Membership"
  ADD COLUMN "customRoleId" TEXT;

CREATE INDEX "Membership_customRoleId_idx" ON "Membership"("customRoleId");

ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_customRoleId_fkey"
  FOREIGN KEY ("customRoleId") REFERENCES "OrgRoleDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrgInvite"
  ADD COLUMN "customRoleId" TEXT;

CREATE INDEX "OrgInvite_customRoleId_idx" ON "OrgInvite"("customRoleId");

ALTER TABLE "OrgInvite"
  ADD CONSTRAINT "OrgInvite_customRoleId_fkey"
  FOREIGN KEY ("customRoleId") REFERENCES "OrgRoleDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
