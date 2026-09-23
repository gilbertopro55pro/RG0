#!/usr/bin/env bash
# Answers "is the live Fly PDF worker running the render-pipeline code in this checkout?" by
# comparing every machine's image tag against render-<hash> (scripts/computeRenderHash.js). The tag
# is set by .github/workflows/deploy-pdf-worker.yml, which deploys with --image-label render-<hash>.
# Uses the Machines REST API directly (curl, no flyctl needed) with $FLY_API_TOKEN.
#
# Prints the expected tag on stdout. Exit codes: 0 = current, 1 = stale/unlabeled, 2 = API error.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="photographer-flow-pdf-worker"
HASH=$(node scripts/computeRenderHash.js | grep -oE '[0-9a-f]{64}')
# computeRenderHash also rewrites src/lib/generated/renderWorkerHash.json with a fresh timestamp;
# restore it so a plain check never leaves the working tree dirty.
git checkout -- src/lib/generated/renderWorkerHash.json 2>/dev/null || true
EXPECTED="render-$HASH"
echo "$EXPECTED"

if [ -z "${FLY_API_TOKEN:-}" ]; then
  echo "FLY_API_TOKEN is not set" >&2
  exit 2
fi

MACHINES=$(curl -sS --fail -H "Authorization: $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/$APP/machines") || { echo "Fly Machines API request failed" >&2; exit 2; }

echo "$MACHINES" | EXPECTED="$EXPECTED" node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const machines = JSON.parse(s);
    const tags = machines.map((m) => (m.config?.image ?? "").split(":").pop());
    tags.forEach((t, i) => console.error(`  ${machines[i].id} (${machines[i].state}): ${t}`));
    process.exit(machines.length > 0 && tags.every((t) => t === process.env.EXPECTED) ? 0 : 1);
  });
'
