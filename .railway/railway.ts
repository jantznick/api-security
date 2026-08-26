import {
  defineRailway,
  github,
  group,
  postgres,
  project,
  service,
} from "railway/iac";

const REPO = "jantznick/api-security";
const BRANCH = "main";

/**
 * API Glimpse — Railway project (Postgres + private ingest + public core + public agent).
 *
 * Apply with: scripts/deploy-railway.sh
 * Requires: railway login + railway link (or init) in this repo.
 */
export default defineRailway(() => {
  const db = postgres("Postgres");

  const ingest = service("ingest", {
    source: github(REPO, { branch: BRANCH }),
    healthcheck: "/health",
    env: {
      NODE_ENV: "production",
      PORT: "3002",
      RAILWAY_DOCKERFILE_PATH: "ingest/Dockerfile",
      ENDPOINT_LIMIT: "0",
      DATABASE_URL: db.env.DATABASE_URL,
    },
  });

  const core = service("core", {
    source: github(REPO, { branch: BRANCH }),
    healthcheck: "/api/health",
    env: {
      NODE_ENV: "production",
      RAILWAY_DOCKERFILE_PATH: "backend/Dockerfile",
      DATABASE_URL: db.env.DATABASE_URL,
      SESSION_SECRET:
        process.env.RAILWAY_SESSION_SECRET ??
        "replace-me-run-scripts-deploy-railway-sh",
      FRONTEND_URLS:
        process.env.RAILWAY_FRONTEND_URLS ??
        "https://app.apiglimpse.com,https://apiglimpse.com",
      MARKETING_URL:
        process.env.RAILWAY_MARKETING_URL ?? "https://apiglimpse.com",
    },
  });

  const agent = service("agent", {
    source: github(REPO, { branch: BRANCH }),
    healthcheck: "/health",
    env: {
      NODE_ENV: "production",
      RAILWAY_DOCKERFILE_PATH: "agent/Dockerfile",
      // Private network; port matches ingest PORT / Dockerfile default.
      INGEST_URL: "http://ingest.railway.internal:3002",
    },
  });

  const stack = group("API Glimpse", [db, ingest, core, agent]);

  return project("api-glimpse", {
    resources: [stack],
  });
});
