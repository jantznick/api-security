#!/usr/bin/env bash
# Provision API Glimpse backend on Railway (Postgres → ingest → core → agent).
#
# Cost policy: uses Railway defaults only — no plan upgrades, no replicas > 1,
# no paid add-ons. Review `railway config plan` before apply.
#
# Prerequisites:
#   brew install railway
#   railway login
#
# Optional: copy .deploy.env.example → .deploy.env and set Render origins for CORS.
#
# Usage:
#   ./scripts/deploy-railway.sh
#   ./scripts/deploy-railway.sh --yes          # skip apply confirmation (agent-friendly)
#   ./scripts/deploy-railway.sh --plan-only    # preview only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

YES=false
PLAN_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --yes) YES=true ;;
    --plan-only) PLAN_ONLY=true ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: brew install railway" >&2
  exit 1
fi

if ! railway whoami >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Not logged in to Railway.

Run once in your terminal (opens browser):
  railway login

Then re-run:
  ./scripts/deploy-railway.sh
EOF
  exit 1
fi

if [[ -f .deploy.env ]]; then
  # shellcheck disable=SC1091
  source .deploy.env
fi

# CORS allowlist for core — comma-separated browser origins (no trailing slashes).
if [[ -n "${RENDER_DASHBOARD_URL:-}" && -n "${RENDER_MARKETING_URL:-}" ]]; then
  export RAILWAY_FRONTEND_URLS="${RENDER_DASHBOARD_URL},${RENDER_MARKETING_URL}"
  export RAILWAY_MARKETING_URL="${RENDER_MARKETING_URL}"
elif [[ -z "${RAILWAY_FRONTEND_URLS:-}" ]]; then
  export RAILWAY_FRONTEND_URLS="https://app.apiglimpse.com,https://apiglimpse.com"
  export RAILWAY_MARKETING_URL="${RAILWAY_MARKETING_URL:-https://apiglimpse.com}"
  echo "Tip: set RENDER_DASHBOARD_URL + RENDER_MARKETING_URL in .deploy.env if custom DNS is not live yet."
fi

if [[ -z "${RAILWAY_SESSION_SECRET:-}" ]]; then
  export RAILWAY_SESSION_SECRET="$(openssl rand -hex 32)"
  echo "Generated SESSION_SECRET for core (stored in Railway, not printed)."
fi

if ! railway status >/dev/null 2>&1; then
  echo "No linked Railway project. Creating api-glimpse…"
  railway init --name api-glimpse --json >/dev/null
fi

echo "=== Railway plan (.railway/railway.ts) ==="
railway config plan

if [[ "$PLAN_ONLY" == true ]]; then
  exit 0
fi

APPLY_ARGS=()
if [[ "$YES" == true ]]; then
  APPLY_ARGS+=(--yes)
fi

echo ""
echo "=== Applying Railway configuration ==="
railway config apply "${APPLY_ARGS[@]}"

list_domains() {
  local svc="$1"
  railway domain list --service "$svc" --json 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
items = data if isinstance(data, list) else data.get('domains', [])
for item in items:
    if isinstance(item, dict):
        d = item.get('domain') or item.get('host')
    else:
        d = item
    if d:
        print(str(d).replace('https://', '').replace('http://', ''))
" 2>/dev/null || true
}

ensure_no_public_domain() {
  local svc="$1"
  local domain
  while IFS= read -r domain; do
    [[ -z "$domain" ]] && continue
    echo "Removing public domain from private service $svc: $domain"
    railway domain delete "$domain" --service "$svc" --yes >/dev/null 2>&1 || true
  done < <(list_domains "$svc")
}

ensure_public_domain() {
  local svc="$1"
  local existing
  existing="$(railway domain list --service "$svc" --json 2>/dev/null || echo '[]')"
  if [[ "$existing" == "[]" || "$existing" == "" || "$existing" == "null" ]]; then
    echo "Generating Railway public domain for: $svc"
    railway domain --service "$svc" >/dev/null
  fi
}

echo ""
echo "=== Networking ==="
ensure_no_public_domain ingest
ensure_public_domain core
ensure_public_domain agent

first_https_domain() {
  local svc="$1"
  local domain
  domain="$(list_domains "$svc" | head -n1)"
  if [[ -n "$domain" ]]; then
    echo "https://${domain}"
  fi
}

core_url="$(first_https_domain core)"
agent_url="$(first_https_domain agent)"

cat <<EOF

=== Railway deploy complete ===

Core API:  ${core_url:-<run: railway domain list --service core>}
Agent:     ${agent_url:-<run: railway domain list --service agent>}
Ingest:    private only (ingest.railway.internal)

=== Next: Render rebuild env vars ===

Set these on your Render static sites, then trigger Manual Deploy (build-time vars):

Dashboard (frontend):
  VITE_API_URL=${core_url:-https://<core>.up.railway.app}
  VITE_APP_URL=\${RENDER_DASHBOARD_URL:-https://app.apiglimpse.com}
  VITE_MARKETING_URL=\${RENDER_MARKETING_URL:-https://apiglimpse.com}
  VITE_DOCS_URL=https://docs.apiglimpse.com

Marketing:
  VITE_API_URL=${core_url:-https://<core>.up.railway.app}
  VITE_APP_URL=\${RENDER_DASHBOARD_URL:-https://app.apiglimpse.com}
  VITE_DOCS_URL=https://docs.apiglimpse.com
  VITE_COLLECT_URL=${agent_url:-https://<agent>.up.railway.app}

Verify:
  curl -s ${core_url:-https://<core>.up.railway.app}/api/health
  curl -s ${agent_url:-https://<agent>.up.railway.app}/health

EOF
