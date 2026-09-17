#!/usr/bin/env bash
# Standard deploy entry point for this project — ALWAYS use this instead of calling
# `vercel --prod` directly. Automatically redeploys the Fly.io PDF worker first whenever the
# render-pipeline files (src/lib/albumPdf.ts, src/lib/albumRaster.ts, src/lib/albumExportJobs.ts,
# worker/src/index.ts) have changed since the worker's last deploy — see
# scripts/computeRenderHash.js for how that fingerprint is computed, and
# src/lib/renderWorkerHealth.ts for the runtime side of this same safety net (which catches it
# even if this script is somehow bypassed). Turns "remember to redeploy the worker" from a memory
# rule into an automatic, deterministic check that runs every single deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

HASH_FILE=".fly-worker-deployed-hash"
CURRENT_HASH=$(node scripts/computeRenderHash.js | grep -oE '[0-9a-f]{64}')

LAST_DEPLOYED_HASH=""
if [ -f "$HASH_FILE" ]; then
  LAST_DEPLOYED_HASH=$(cat "$HASH_FILE")
fi

if [ "$CURRENT_HASH" != "$LAST_DEPLOYED_HASH" ]; then
  echo "==> Render-pipeline files changed since the last Fly worker deploy — redeploying it first."
  fly deploy -a photographer-flow-pdf-worker -c fly.toml --dockerfile Dockerfile.worker
  echo "$CURRENT_HASH" > "$HASH_FILE"
else
  echo "==> Fly worker already up to date (hash $CURRENT_HASH) — skipping redeploy."
fi

echo "==> Deploying to Vercel..."
npx vercel@59.10.0 --prod --yes

echo "==> Verifying myframeflow.com alias..."
npx vercel@59.10.0 alias ls | grep myframeflow.com || echo "WARNING: myframeflow.com not found in alias list — check manually."
