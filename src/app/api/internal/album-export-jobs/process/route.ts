import { NextResponse, after, type NextRequest } from "next/server";
import { processAlbumExportJob } from "@/lib/albumExportJobs";

export const runtime = "nodejs";
// A large album's PDF specifically can need several full re-render passes (see QUALITY_STEPS in
// albumExportJobs.ts) to hit its target file size, and 300s wasn't always enough for that —
// confirmed live: a 19-page export got stuck mid-pass. Matches the same 800s ceiling already used
// for gallery zip downloads (zip-jobs/process/route.ts), which the Vercel plan here already
// supports.
export const maxDuration = 800;

// Triggered server-to-server (never by the browser) right after an export route creates a job row
// — see triggerAlbumExportProcessing in albumExportJobs.ts, which is itself called from inside the
// CREATING route's own after() and awaits this endpoint's response.
//
// THE BUG THIS FIXES: this used to `await processAlbumExportJob(jobId)` directly before responding
// — meaning the actual (many-minute) render only ever ran inside the calling chain triggered by the
// CREATING route's own after(), and that creating route (export-pdf/route.ts etc.) has no
// maxDuration override of its own, so it's stuck on the platform's short default. The 800s here was
// real but irrelevant: the whole chain got torn down the moment the OUTER route's own (short,
// default) budget ran out, long before this route's 800s ever mattered — which is exactly what
// "stuck at X%" looked like (whatever processed_count had been written stays frozen, and the stale-
// job cron only retries every ~15–30 minutes, restarting the whole multi-pass PDF loop from
// scratch every time). Matching zip-jobs/process/route.ts's own proven pattern — respond
// IMMEDIATELY and do the real work in after() — means this route's own 800s budget is what actually
// governs the render, decoupled from every other hop in the chain.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { jobId }: { jobId: string } = await request.json();
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

  const origin = new URL(request.url).origin;
  after(() => processAlbumExportJob(jobId, origin));
  return NextResponse.json({ ok: true });
}
