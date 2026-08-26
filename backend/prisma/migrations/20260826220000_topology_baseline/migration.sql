-- SF9 — project topology baseline + drift events
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "topologyBaseline" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "topologyBaselineUpdatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ProjectTopologyEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "driftKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ProjectTopologyEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectTopologyEvent_projectId_driftKey_key" ON "ProjectTopologyEvent"("projectId", "driftKey");
CREATE INDEX IF NOT EXISTS "ProjectTopologyEvent_projectId_createdAt_idx" ON "ProjectTopologyEvent"("projectId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ProjectTopologyEvent" ADD CONSTRAINT "ProjectTopologyEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
