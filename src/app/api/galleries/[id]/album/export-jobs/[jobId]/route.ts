import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { getSignedDownloadUrl } from "@/lib/storage";
import type { GalleryAlbumExportJobRow, GalleryAlbumRow, GalleryRow } from "@/lib/types";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { jobId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;
  const supabase = createServiceRoleClient();

  // Looked up by the job's OWN gallery_id, not the URL's :id — since findActiveExportJob is now
  // scoped per-photographer (not per-gallery), the "already active" job a photographer gets routed
  // to from a DIFFERENT gallery's export button legitimately belongs to another one of their
  // galleries. Authorization still only ever depends on the photographer owning the job's real
  // gallery, exactly as strict as the old URL-must-match check, just not requiring the URL to
  // happen to name the right gallery too.
  const { data: job } = await supabase.from("gallery_album_export_jobs").select("*").eq("id", jobId).maybeSingle<GalleryAlbumExportJobRow>();
  if (!job) {
    return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
  }
  const { data: gallery } = await supabase.from("galleries").select("id, title, photographer_id").eq("id", job.gallery_id).maybeSingle<Pick<GalleryRow, "id" | "title" | "photographer_id">>();
  if (!gallery || gallery.photographer_id !== auth.userId) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  let downloadUrl: string | null = null;
  let filename: string | null = null;
  if (job.status === "ready" && job.storage_path) {
    const { data: album } = await supabase.from("gallery_albums").select("title").eq("id", job.album_id).maybeSingle<Pick<GalleryAlbumRow, "title">>();
    const base = `${album?.title ?? "אלבום"} - ${gallery.title}`;
    const ext = job.format === "pdf" ? "pdf" : "zip";
    filename = `${base}.${ext}`;
    downloadUrl = await getSignedDownloadUrl("galleries", job.storage_path, 60 * 60, filename);
  }

  return NextResponse.json({
    status: job.status,
    processedCount: job.processed_count,
    totalCount: job.total_count,
    // PDF only (always 0 for jpg/psd, which don't have quality-step retries at all) — lets the
    // client map progress into a fixed, always-forward-moving band per attempt instead of showing
    // the raw per-attempt processedCount/totalCount, which visibly resets to 0% every time a
    // quality-step retry starts a fresh render pass. See downloadFromRoute's own comment on the
    // client side for the band scheme.
    qualityStepIndex: job.pdf_quality_step_index,
    errorMessage: job.error_message,
    downloadUrl,
    filename,
  });
}

// Cancelling an export used to only abort the CLIENT's own polling loop — the actual server-side
// job kept running (or, for the PDF path's page-batched retries, kept getting picked up by the
// retry-stuck-jobs cron indefinitely) with nothing ever telling it the photographer walked away.
// Confirmed live 2026-09-02: leftover jobs from an earlier debugging session were STILL being
// retried by that cron days later, competing for the same gallery's R2/render resources against a
// real, unrelated export and visibly slowing it down — exactly the failure mode a real cancel needs
// to prevent. Setting status to "cancelled" is enough on its own: the cron's own pending/processing
// pickup queries only ever touch those two statuses (see retry-stuck-zip-jobs/route.ts), so a
// cancelled row is naturally left alone from this point on, and processAlbumExportJob's own
// `if (job.status !== "pending") return` guard means any invocation already in flight for this job
// will see the changed status and stop cleanly the next time it checks in (before handing off to
// another page batch or quality step — see albumExportJobs.ts).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { jobId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;
  const supabase = createServiceRoleClient();

  // Same job-owns-its-own-gallery lookup as GET above (see that handler's own comment) — the job
  // being cancelled may belong to a different gallery than the URL's :id when it was reached via
  // the per-photographer "already active" redirect.
  const { data: job } = await supabase.from("gallery_album_export_jobs").select("gallery_id").eq("id", jobId).maybeSingle<{ gallery_id: string }>();
  if (!job) return NextResponse.json({ ok: true });
  const { data: gallery } = await supabase.from("galleries").select("id, photographer_id").eq("id", job.gallery_id).maybeSingle<Pick<GalleryRow, "id" | "photographer_id">>();
  if (!gallery || gallery.photographer_id !== auth.userId) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  // Only a job still genuinely in flight gets cancelled — one that already finished (or already
  // failed) has nothing left running server-side to stop, and overwriting a "ready" row would just
  // orphan its own finished file for no reason.
  await supabase
    .from("gallery_album_export_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["pending", "processing"]);

  return NextResponse.json({ ok: true });
}
