-- Lightweight caller → endpoint topology edges (SF3).
CREATE TABLE "TrafficEdge" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "callerKey" TEXT NOT NULL,
    "callerName" TEXT NOT NULL,
    "callerSource" TEXT,
    "uaFamily" TEXT NOT NULL DEFAULT 'unknown',
    "method" TEXT NOT NULL,
    "pathTemplate" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficEdge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrafficEdge_serviceId_callerKey_method_pathTemplate_key" ON "TrafficEdge"("serviceId", "callerKey", "method", "pathTemplate");

CREATE INDEX "TrafficEdge_serviceId_idx" ON "TrafficEdge"("serviceId");

CREATE INDEX "TrafficEdge_serviceId_pathTemplate_method_idx" ON "TrafficEdge"("serviceId", "pathTemplate", "method");

CREATE INDEX "TrafficEdge_lastSeenAt_idx" ON "TrafficEdge"("lastSeenAt");

ALTER TABLE "TrafficEdge" ADD CONSTRAINT "TrafficEdge_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
