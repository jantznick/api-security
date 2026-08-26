-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpointLimit" INTEGER,
    "priceCentsMonthly" INTEGER NOT NULL DEFAULT 0,
    "stripePriceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "User" ADD COLUMN "planSlug" TEXT NOT NULL DEFAULT 'free';

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "User_planSlug_idx" ON "User"("planSlug");

-- Seed default plans (Free / Pro). Pro price is a placeholder until Nick sets stripePriceId / cents.
INSERT INTO "Plan" ("id", "slug", "name", "endpointLimit", "priceCentsMonthly", "stripePriceId", "active", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('plan_free_default', 'free', 'Free', 25, 0, NULL, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_pro_default', 'pro', 'Pro', 500, 2900, NULL, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
