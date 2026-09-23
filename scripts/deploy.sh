#!/usr/bin/env bash
# Standard deploy entry point for this project — ALWAYS use this instead of calling
# `vercel --prod` directly.
#
# The Fly.io PDF worker is NOT deployed from here anymore: .github/workflows/deploy-pdf-worker.yml
# deploys it on every merge to main whose render-pipeline code differs from what's live (the Claude
# Code cloud environment can't reach Fly's remote builders). This script only refuses to ship the
# web app while the worker is still on older render code — the web app's expected hash would
# otherwise mismatch the worker's, see src/lib/renderWorkerHealth.ts for the runtime side of the
# same check. Set SKIP_WORKER_CHECK=1 to bypass it deliberately.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${SKIP_WORKER_CHECK:-}" = "1" ]; then
  echo "==> SKIP_WORKER_CHECK=1 — not checking the Fly worker."
else
  echo "==> Checking the Fly PDF worker runs this checkout's render code..."
  set +e
  bash scripts/flyWorkerIsCurrent.sh
  CODE=$?
  set -e
  if [ "$CODE" = 1 ]; then
    echo "ERROR: the Fly worker is not on this render code yet. Wait for the 'Deploy PDF worker'" >&2
    echo "GitHub Actions run on main to finish (it deploys the worker), then rerun this script." >&2
    exit 1
  elif [ "$CODE" != 0 ]; then
    echo "ERROR: couldn't read the Fly worker's state (see above). Rerun with SKIP_WORKER_CHECK=1" >&2
    echo "only if you know the worker is current." >&2
    exit 1
  fi
  echo "==> Fly worker is current."
fi

echo "==> Deploying to Vercel..."
npx vercel@59.10.0 --prod --yes

echo "==> Verifying myframeflow.com alias..."
npx vercel@59.10.0 alias ls | grep myframeflow.com || echo "WARNING: myframeflow.com not found in alias list — check manually."
