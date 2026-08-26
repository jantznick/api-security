-- SF6: outbound webhook + Slack incoming webhook URLs on Project and Service
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "slackWebhookUrl" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "slackWebhookUrl" TEXT;
