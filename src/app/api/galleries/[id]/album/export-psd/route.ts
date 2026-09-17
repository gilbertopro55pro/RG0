import { NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { countExportPages, findActiveExportJob, triggerAlbumExportProcessing } from "@/lib/albumExportJobs";
import type { GalleryAlbumRow, GalleryRow } from "@/lib/types";

export const runtime = "nodejs";

// Creates a background export job and returns immediately — see export-jpg/route.ts's comment,
// this is the identical pattern for PSD.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // See export-pdf/route.ts's own comment on why this whole body is now wrapped — an unhandled
  // exception here used to crash with a non-JSON response the client couldn't parse, surfacing as
  // an unhelpful generic error with zero diagnostic info.
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

    const body: { from?: number; to?: number } = await request.json().catch(() => ({}));
    const fromPage = body.from ?? 1;
    const toPage = body.to ?? fromPage;

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
        format: "psd",
        from_page: fromPage,
        to_page: toPage,
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

    const origin = new URL(request.url).origin;
    after(() => triggerAlbumExportProcessing(job.id, origin));

    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    console.error("[export-psd] unhandled error creating export job", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה לא צפויה ביצירת הייצוא" }, { status: 500 });
  }
}
