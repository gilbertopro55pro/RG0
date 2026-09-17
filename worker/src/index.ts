// Fly.io background worker — PDF album exports ONLY. See processAlbumPdfJobOnWorker's own comment
// in ../../src/lib/albumExportJobs.ts for why this exists separately from the Vercel-based job
// system: Vercel's serverless functions turned out to have a real, undocumented execution ceiling
// around ~90-100s regardless of the declared maxDuration, which forced PDF rendering into a
// one-page-per-invocation chain just to survive it. This is a genuinely persistent process (a real
// Fly.io VM, not a burst function) with no such ceiling, so it can just poll for pending PDF jobs
// and render each one fully, in one shot, the way the very first version of this feature did.
//
// JPG/PSD exports are untouched — they stay on Vercel via processAlbumExportJob, since they never
// needed this workaround (a JPG/PSD export is a zip of independent per-page files, not one
// cumulative document that has to survive a single long render).
import { createServiceRoleClient } from "../../src/lib/supabase/serviceRole";
import { processAlbumPdfJobOnWorker } from "../../src/lib/albumExportJobs";
// Baked in at image-build time by `RUN node scripts/computeRenderHash.js` in Dockerfile.worker —
// see that script's own comment. Reporting this every tick is what lets the web app's pre-export
// check (src/lib/renderWorkerHealth.ts) tell "this machine is still running an older deploy" apart
// from "up to date."
import renderWorkerHash from "../../src/lib/generated/renderWorkerHash.json";

const POLL_INTERVAL_MS = 4000;

async function heartbeat(): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("worker_status")
    .upsert({ id: 1, code_hash: renderWorkerHash.hash, last_heartbeat_at: new Date().toISOString() });
  if (error) console.error("[worker] heartbeat failed", error.message);
}

async function pollOnce(): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: jobs } = await supabase
    .from("gallery_album_export_jobs")
    .select("id")
    .eq("format", "pdf")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<{ id: string }[]>();
  const job = jobs?.[0];
  if (!job) return;
  console.log(`[worker] picking up PDF export job ${job.id}`);
  const startedAt = Date.now();
  try {
    await processAlbumPdfJobOnWorker(job.id);
    console.log(`[worker] finished job ${job.id} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } catch (e) {
    // processAlbumPdfJobOnWorker already marks the job "failed" internally on a caught error — this
    // catch is only for something escaping that (shouldn't normally happen), so the poll loop
    // itself never dies from one bad job.
    console.error(`[worker] job ${job.id} threw past its own error handling`, e);
  }
}

async function main() {
  console.log("[worker] starting PDF export worker, polling every", POLL_INTERVAL_MS, "ms");
  // Sequential on purpose — one job at a time. A real Fly.io machine still has finite CPU/RAM, and
  // running two heavy album renders concurrently would just slow both down rather than genuinely
  // parallelizing; if throughput ever matters, scale by running more Fly.io machines instead of
  // adding concurrency inside one.
  // Runs on its OWN independent timer, deliberately not awaited alongside pollOnce() below — a
  // real render can block that loop for minutes (a confirmed 902s render exists), and this must
  // keep proving the machine is alive throughout, not just between jobs. If it were sequenced with
  // pollOnce() instead, a single long render would starve the heartbeat and make an actively-
  // working machine look "dead" to the staleness check.
  setInterval(() => {
    heartbeat().catch((e) => console.error("[worker] heartbeat error", e));
  }, POLL_INTERVAL_MS);
  await heartbeat();

  while (true) {
    try {
      await pollOnce();
    } catch (e) {
      console.error("[worker] poll loop error", e);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main();
