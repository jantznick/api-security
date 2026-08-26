-- SF2 drift events + SF3 topology edges + webhook URL + protect MVP
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT;

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "protectEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "protectMode" TEXT NOT NULL DEFAULT 'observe';
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "protectRule" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "protectVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "InventoryEvent" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "endpointId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "InventoryEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrafficEdge" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "callerKey" TEXT NOT NULL,
    "callerLabel" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "pathTemplate" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficEdge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventoryEvent_serviceId_createdAt_idx" ON "InventoryEvent"("serviceId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryEvent_serviceId_readAt_idx" ON "InventoryEvent"("serviceId", "readAt");
CREATE INDEX IF NOT EXISTS "InventoryEvent_endpointId_idx" ON "InventoryEvent"("endpointId");
CREATE INDEX IF NOT EXISTS "InventoryEvent_type_idx" ON "InventoryEvent"("type");

CREATE UNIQUE INDEX IF NOT EXISTS "TrafficEdge_serviceId_callerKey_method_pathTemplate_key" ON "TrafficEdge"("serviceId", "callerKey", "method", "pathTemplate");
CREATE INDEX IF NOT EXISTS "TrafficEdge_serviceId_idx" ON "TrafficEdge"("serviceId");
CREATE INDEX IF NOT EXISTS "TrafficEdge_lastSeenAt_idx" ON "TrafficEdge"("lastSeenAt");

DO $$ BEGIN
  ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TrafficEdge" ADD CONSTRAINT "TrafficEdge_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
