-- SF2: inventory drift events + optional webhook URLs

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "webhookUrl" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "webhookUrl" TEXT;

-- CreateTable
CREATE TABLE "InventoryEvent" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "endpointId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "InventoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryEvent_serviceId_createdAt_idx" ON "InventoryEvent"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryEvent_serviceId_readAt_idx" ON "InventoryEvent"("serviceId", "readAt");

-- CreateIndex
CREATE INDEX "InventoryEvent_endpointId_idx" ON "InventoryEvent"("endpointId");

-- CreateIndex
CREATE INDEX "InventoryEvent_type_idx" ON "InventoryEvent"("type");

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
