#!/usr/bin/env node
// Computes one fingerprint for the render pipeline the Fly worker actually runs — used to decide
// whether the worker needs a fresh `fly deploy` (scripts/deploy.sh) and whether it's currently
// running stale code (src/lib/renderWorkerHealth.ts, checked before a new PDF export job starts).
//
// Previously this was a hand-maintained list of 4 files. That silently rotted: a real bug fix
// landed in src/lib/pdfText.ts (the bidi text layout engine, shared by the PDF, JPG and PSD
// exporters) and src/lib/albumPsd.ts — neither was in the list, so the hash never changed,
// deploy.sh never redeployed the Fly worker, and it kept serving broken exports (garbled/mirrored
// Hebrew text, stale PDF output) indefinitely despite the app itself being fully up to date.
// Confirmed 2026-09-16 from a real user report with an actual broken export file attached.
//
// Fix: don't hand-maintain the list — WALK it. Starting from worker/src/index.ts (the worker's
// real entry point), follow every local import ("@/..." and "./"/"../" specifiers) transitively,
// skipping node_modules/external packages, and hash the full resulting file set. Any file the
// worker can actually reach ends up tracked automatically; nothing to remember to add by hand.
//
// Run identically on both sides so they can be COMPARED, not just each computed in isolation:
//   - Next.js build (package.json's "prebuild"): captures what the web app EXPECTS the worker to
//     be running, as of the most recent `npm run build` (Vercel deploy).
//   - Fly worker image build (Dockerfile.worker): captures what the worker ACTUALLY is running, as
//     of the most recent `fly deploy`.
// Both write the identical JSON shape to src/lib/generated/renderWorkerHash.json, so a plain
// string-equality check between "what Vercel last built" and "what Fly last built" is the whole
// staleness test — see src/lib/renderWorkerHealth.ts for where that comparison actually happens.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_FILE = path.join(REPO_ROOT, "src/lib/generated/renderWorkerHash.json");
const ENTRY_FILES = ["worker/src/index.ts"];
// package.json/package-lock.json aren't part of the import graph a regex walk can follow, but a
// dependency version bump (sharp, fontkit, ag-psd, pdf-lib...) can change render output just as
// much as an edit to our own code — cheap to track, and only ever causes an extra (harmless) Fly
// redeploy, never a missed one.
const EXTRA_FILES = ["package.json", "package-lock.json"];

const IMPORT_SPECIFIER_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
const RESOLVE_EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveSpecifier(specifier, fromFileAbsPath) {
  let basePath;
  if (specifier.startsWith("@/")) {
    basePath = path.join(REPO_ROOT, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    basePath = path.resolve(path.dirname(fromFileAbsPath), specifier);
  } else {
    return null; // bare specifier — an external (node_modules) package, not part of our own code
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = basePath + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null; // resolves to something this script doesn't recognize (e.g. a .json import) — skip
}

function collectImportGraph(entryAbsPaths) {
  const visited = new Set();
  const queue = [...entryAbsPaths];

  while (queue.length > 0) {
    const current = queue.pop();
    // worker/src/index.ts imports its own OWN generated hash output (to report as its heartbeat)
    // — following that edge would make the hash include itself, so each run's result would depend
    // on the PREVIOUS run's output instead of being a pure function of the source files. Skip it;
    // its content is exactly what this script produces, never an input to it.
    if (visited.has(current) || current === OUTPUT_FILE) continue;
    visited.add(current);

    const contents = fs.readFileSync(current, "utf8");
    for (const match of contents.matchAll(IMPORT_SPECIFIER_RE)) {
      const resolved = resolveSpecifier(match[1], current);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return visited;
}

const entryAbsPaths = ENTRY_FILES.map((p) => path.join(REPO_ROOT, p));
const graphFiles = collectImportGraph(entryAbsPaths);
const allAbsPaths = [...graphFiles, ...EXTRA_FILES.map((p) => path.join(REPO_ROOT, p))];

// Sorted (by repo-relative path) so the hash is stable regardless of traversal order.
const relPaths = allAbsPaths.map((p) => path.relative(REPO_ROOT, p)).sort();

const hash = crypto.createHash("sha256");
for (const relPath of relPaths) {
  const contents = fs.readFileSync(path.join(REPO_ROOT, relPath));
  hash.update(relPath);
  hash.update(contents);
}
const digest = hash.digest("hex");

const outDir = path.join(REPO_ROOT, "src/lib/generated");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "renderWorkerHash.json"),
  JSON.stringify({ hash: digest, computedAt: new Date().toISOString(), files: relPaths }, null, 2) + "\n"
);

console.log(`[computeRenderHash] ${digest} (${relPaths.length} files)`);
