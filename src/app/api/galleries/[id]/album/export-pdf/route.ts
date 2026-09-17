import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { countExportPages, findActiveExportJob } from "@/lib/albumExportJobs";
import { checkRenderWorkerHealth } from "@/lib/renderWorkerHealth";
import type { GalleryAlbumRow, GalleryRow } from "@/lib/types";

export const runtime = "nodejs";

// Creates a background export job and returns immediately — see export-jpg/route.ts's comment.
// PDF is the slowest of the three (up to several full re-render passes at descending JPEG quality
// to hit a target file size — see albumExportJobs.ts), which is exactly why this mattered most here.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // No route here had a top-level try/catch — any unexpected exception (a transient Supabase
  // hiccup, a malformed session cookie, etc.) crashed with Next.js's own generic error response
  // instead of clean JSON, which the client's `res.json().catch(() => ({}))` then silently turned
  // into an unhelpful "שגיאה בייצוא הקבצים" with zero diagnostic info. Found investigating a real
  // report of exactly that (2026-09-05) — the underlying export had actually SUCCEEDED (confirmed
  // in the DB), so whatever threw was downstream of job creation, but nothing here would have told
  // us that. Logged now so a recurrence is actually diagnosable instead of a dead end.
  try {
    const { id: galleryId } = await params;
    const auth = await authenticateGalleryRequest(request);
    if ("error" in auth) return auth.error;
    const supabase = createServiceRoleClient();

    const { data: gallery } = await supabase.from("galleries").select("*").eq("id", galleryId).maybeSingle<GalleryRow>();
    if (!gallery || gallery.photographer_id !== auth.userId) {
      return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
    }

    const { data: album } = await supabase.from("gallery_albums").select("*").eq("gallery_id", galleryId).maybeSingle<GalleryAlbumRow>();
    if (!album) {
      return NextResponse.json({ error: "לא נמצא אלבום לגלריה זו" }, { status: 404 });
    }

    // One active export at a time per PHOTOGRAPHER, regardless of which gallery/format/screen
    // asked — see findActiveExportJob's own comment for why this lives here instead of only as
    // client state.
    const active = await findActiveExportJob(supabase, gallery.photographer_id);
    if (active) return NextResponse.json({ jobId: active.id, alreadyActive: true, format: active.format, galleryId: active.galleryId });

    // PDF rendering happens entirely on the separate Fly.io worker (see the comment at the bottom
    // of this route) — a new job left "pending" here is only as good as whatever code that worker
    // actually happens to be running right now. Block starting one while it's stale or unreachable
    // instead of silently queuing a job that'll render with outdated logic (or never get picked up).
    const workerHealth = await checkRenderWorkerHealth(supabase);
    if (!workerHealth.ok) {
      return NextResponse.json({ error: workerHealth.reason }, { status: 503 });
    }

    const body: { from?: number; to?: number; quality?: "high" | "web" } = await request.json().catch(() => ({}));
    const fromPage = body.from ?? 1;
    const toPage = body.to ?? fromPage;
    const quality: "high" | "web" = body.quality === "web" ? "web" : "high";

    const totalCount = await countExportPages(galleryId, fromPage, toPage);
    if (totalCount === null) {
      return NextResponse.json({ error: "אין עדיין עמודים באלבום" }, { status: 400 });
    }

    const { data: job, error } = await supabase
      .from("gallery_album_export_jobs")
      .insert({
        album_id: album.id,
        gallery_id: gallery.id,
        photographer_id: gallery.photographer_id,
        format: "pdf",
        from_page: fromPage,
        to_page: toPage,
        quality,
        total_count: totalCount,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !job) {
      // 23505 = unique_violation on gallery_album_export_jobs_one_active_per_photographer — see
      // export-jpg/route.ts's own comment for the race this catches.
      if (error?.code === "23505") {
        const winner = await findActiveExportJob(supabase, gallery.photographer_id);
        if (winner) return NextResponse.json({ jobId: winner.id, alreadyActive: true, format: winner.format, galleryId: winner.galleryId });
      }
      return NextResponse.json({ error: error?.message ?? "שגיאה ביצירת הייצוא" }, { status: 500 });
    }

    // No Vercel-side trigger here anymore (2026-09-03) — the job is just left "pending" for the
    // Fly.io background worker (worker/src/index.ts) to pick up on its own poll loop instead. See
    // processAlbumPdfJobOnWorker's own comment in albumExportJobs.ts for why PDF rendering moved off
    // Vercel entirely: a persistent worker process has no serverless-style execution ceiling, unlike
    // Vercel's functions (which turned out to have a real, undocumented one around ~90-100s
    // regardless of maxDuration). The existing retry-stuck-zip-jobs cron (see its own comment) still
    // picks up any album-export job left in "pending" and calls triggerAlbumExportProcessing on it —
    // that stays as a rare fallback for if the Fly worker is ever down, but the worker's own fast
    // (few-second) poll interval means it wins that race in the normal case.
    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    console.error("[export-pdf] unhandled error creating export job", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה לא צפויה ביצירת הייצוא" }, { status: 500 });
  }
}
