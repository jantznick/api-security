-- AlterTable
ALTER TABLE "Project" ADD COLUMN "endpointLimit" INTEGER;

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "revokedAt" TIMESTAMP(3);
