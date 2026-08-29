import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { removeObjects } from "@/lib/storage";
import { triggerZipJobProcessing } from "@/lib/zipJobs";

// Two housekeeping jobs for the zip-job system (see src/lib/zipJobs.ts):
//
// 1. Safety net for the processing chain — the normal path is each part triggering the next one
//    directly via a server-to-server request, with no cron involved at all. This only matters if
//    a link in that chain is lost (a cold-start timing issue, a crashed invocation that never got
//    to update its own row) and a part is left waiting with nothing left to nudge it forward.
//
// 2. Deletes finished zip files past their expires_at — nothing keeps a photographer's or
//    client's gallery downloads coming back for a specific batch id days later, so there's no
//    reason to keep large archives sitting in storage indefinitely.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: expiredJobs } = await supabase
    .from("gallery_zip_jobs")
    .select("id, storage_path")
    .lt("expires_at", new Date().toISOString())
    .returns<{ id: string; storage_path: string | null }[]>();
  if (expiredJobs && expiredJobs.length > 0) {
    const paths = expiredJobs.map((j) => j.storage_path).filter((p): p is string => !!p);
    if (paths.length > 0) await removeObjects("galleries", paths);
    await supabase
      .from("gallery_zip_jobs")
      .delete()
      .in("id", expiredJobs.map((j) => j.id));
  }

  // A part can now legitimately run for many minutes (up to the processing route's own
  // maxDuration) while still making real progress — processZipJobPart bumps updated_at on every
  // progress checkpoint, not just on its final status change, so this only catches a row whose
  // updated_at genuinely stopped moving (its invocation crashed or was lost), not one still
  // actively working through a large part.
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // A row stuck in "processing" past this cutoff means its invocation almost certainly crashed
  // before reaching the success/failure update — put it back in the queue so it's picked up as a
  // fresh attempt instead of sitting there forever looking "in progress".
  await supabase
    .from("gallery_zip_jobs")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", staleCutoff);

  const { data: stuckJobs } = await supabase
    .from("gallery_zip_jobs")
    .select("id, batch_id")
    .eq("status", "pending")
    .lt("updated_at", staleCutoff)
    .order("part_index", { ascending: true })
    .returns<{ id: string; batch_id: string }[]>();

  if (!stuckJobs || stuckJobs.length === 0) {
    return NextResponse.json({ retried: 0, expired: expiredJobs?.length ?? 0 });
  }

  // Only the earliest stuck part per batch needs a nudge — triggering it re-starts that batch's
  // chain, which picks up the rest of its own parts on its own as each one finishes.
  const seenBatches = new Set<string>();
  const origin = new URL(request.url).origin;
  let retried = 0;
  for (const job of stuckJobs) {
    if (seenBatches.has(job.batch_id)) continue;
    seenBatches.add(job.batch_id);
    await triggerZipJobProcessing(job.id, origin);
    retried++;
  }

  return NextResponse.json({ retried, expired: expiredJobs?.length ?? 0 });
}
