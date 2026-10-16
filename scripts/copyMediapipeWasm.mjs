// Copies MediaPipe's vision WASM (the photo-culling engine, lib/culling/engine.ts) from
// node_modules into public/, so the browser loads it from our own domain at the exact installed
// version: no third-party CDN at runtime, and it works offline in the desktop app later. Only the
// SIMD build (every browser we support has WASM SIMD). The files are generated, not committed
// (.gitignore); this runs before every build and before `npm run dev`. Not on install: the PDF
// worker image (Dockerfile.worker) runs npm ci before the scripts folder is copied in.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = path.join(root, "public", "models", "mediapipe");
if (!fs.existsSync(from)) {
  console.warn("copyMediapipeWasm: @mediapipe/tasks-vision is not installed, skipped");
  process.exit(0);
}
fs.mkdirSync(to, { recursive: true });
for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  fs.copyFileSync(path.join(from, file), path.join(to, file));
}
console.log("copyMediapipeWasm: copied to public/models/mediapipe");
