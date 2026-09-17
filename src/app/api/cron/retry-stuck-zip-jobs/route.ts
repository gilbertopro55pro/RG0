import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { removeObjects } from "@/lib/storage";
import { triggerZipJobProcessing } from "@/lib/zipJobs";
import { triggerAlbumExportProcessing } from "@/lib/albumExportJobs";

// Housekeeping for BOTH background job systems that share this exact pattern — gallery zip
// downloads (src/lib/zipJobs.ts) and album JPG/PSD/PDF exports (src/lib/albumExportJobs.ts):
//
// 1. Safety net for the processing trigger — the normal path is the export/zip route firing a
//    single server-to-server request right after creating the job row, with no cron involved at
//    all. This only matters if that trigger is lost (a cold-start timing issue, a crashed
//    invocation that never got to update its own row) and a job is left waiting with nothing left
//    to nudge it forward.
//
// 2. Deletes finished files past their expires_at — nothing keeps a photographer's downloads
//    coming back for a specific job days later, so there's no reason to keep them in storage
//    indefinitely.
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

  // BUG THIS FIXES (found 2026-09-01): this used to `return` right here whenever there were no
  // stuck ZIP jobs — which is the common case, since zip downloads rarely get stuck — silently
  // skipping EVERY line of the album_export_jobs housekeeping below for the exact same reason it
  // exists at all. In practice this meant an album export stuck in "processing" was NEVER actually
  // retried by this cron, no matter how many 15-minute cycles passed: confirmed live via jobs still
  // sitting in "processing" more than 2 hours after their last progress update. `origin` moved up
  // here so both housekeeping blocks below can use it regardless of which one has work to do.
  //
  // SECOND BUG THIS FIXES (found 2026-09-02): `new URL(request.url).origin` derives the origin
  // from whatever host actually received THIS request — reliable when curled directly against
  // myframeflow.com, but Vercel's own cron invoker doesn't necessarily hit the function through
  // that same public hostname. Confirmed live: this cron's stale-"processing"→"pending" reset
  // fired correctly on its own schedule (proving Vercel's scheduler itself runs), but the
  // immediately-following triggerAlbumExportProcessing call for that same row silently went
  // nowhere — consistent with its fetch targeting a wrong/internal origin and failing inside
  // triggerAlbumExportProcessing's own `.catch(() => {})`. Hardcoding the known public origin
  // (matching the same fallback pattern already used in contracts/[token]/sign/route.ts) removes
  // that dependency entirely — every self-trigger call this route makes now always targets the
  // real public API regardless of how Vercel itself invoked this cron.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://myframeflow.com";

  // Only the earliest stuck part per batch needs a nudge — triggering it re-starts that batch's
  // chain, which picks up the rest of its own parts on its own as each one finishes.
  const seenBatches = new Set<string>();
  let retried = 0;
  for (const job of stuckJobs ?? []) {
    if (seenBatches.has(job.batch_id)) continue;
    seenBatches.add(job.batch_id);
    await triggerZipJobProcessing(job.id, origin);
    retried++;
  }

  // Same two housekeeping steps, for album_export_jobs — expire finished exports past their own
  // storage cleanup date, then retry any job whose invocation crashed mid-render (stuck in
  // "processing") or was never picked up at all (stuck in "pending" past the trigger window).
  const { data: expiredAlbumJobs } = await supabase
    .from("gallery_album_export_jobs")
    .select("id, storage_path")
    .lt("expires_at", new Date().toISOString())
    .returns<{ id: string; storage_path: string | null }[]>();
  if (expiredAlbumJobs && expiredAlbumJobs.length > 0) {
    const paths = expiredAlbumJobs.map((j) => j.storage_path).filter((p): p is string => !!p);
    if (paths.length > 0) await removeObjects("galleries", paths);
    await supabase.from("gallery_album_export_jobs").delete().in("id", expiredAlbumJobs.map((j) => j.id));
  }

  await supabase
    .from("gallery_album_export_jobs")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", staleCutoff);

  // No staleness filter here (unlike the "processing" reset above) — a "pending" album-export job
  // isn't necessarily stuck at all. The PDF path (see albumExportJobs.ts) now renders in small page
  // batches, each its own invocation that hands off to the next by setting status back to
  // "pending" and firing its own self-trigger fetch — but that fetch can't always be relied on to
  // actually complete (found live 2026-09-01: a healthy, just-finished batch sat in "pending" for
  // 9+ minutes with nothing picking it up, even though nothing had crashed). processAlbumExportJob's
  // own `if (job.status !== "pending") return` guard already makes it safe to just try every
  // pending row on every cron tick — a row already being worked on by another invocation is a
  // harmless no-op here, not a double-process. This cron's own frequency (see vercel.json) is what
  // now bounds the worst-case gap between batches, so it was tightened alongside this.
  const { data: stuckAlbumJobs } = await supabase.from("gallery_album_export_jobs").select("id").eq("status", "pending").returns<{ id: string }[]>();
  let albumRetried = 0;
  for (const job of stuckAlbumJobs ?? []) {
    await triggerAlbumExportProcessing(job.id, origin);
    albumRetried++;
  }

  return NextResponse.json({
    retried,
    expired: expiredJobs?.length ?? 0,
    albumRetried,
    albumExpired: expiredAlbumJobs?.length ?? 0,
  });
}
