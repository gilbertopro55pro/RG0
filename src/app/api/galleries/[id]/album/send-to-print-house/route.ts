import { NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { countExportPages, triggerAlbumExportProcessing } from "@/lib/albumExportJobs";
import type { GalleryAlbumRow, GalleryRow } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const runtime = "nodejs";

// Creates a background export job and returns immediately — same real-progress system as
// export-jpg/export-psd/export-pdf (see albumExportJobs.ts). Only JPG ever goes to a print house
// from here (not PDF/PSD) — the album's own working files, not a print-ready deliverable format.
// The only difference from a plain download job: send_to_email is set, so processAlbumExportJob
// emails a link once the file is ready instead of the client downloading it directly.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: galleryId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const body: { email?: string; from?: number; to?: number } = await request.json().catch(() => ({}));
  const email = (body.email ?? "").trim();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "כתובת מייל לא תקינה" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase.from("galleries").select("*").eq("id", galleryId).maybeSingle<GalleryRow>();
  if (!gallery || gallery.photographer_id !== auth.userId) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  const { data: album } = await supabase.from("gallery_albums").select("*").eq("gallery_id", galleryId).maybeSingle<GalleryAlbumRow>();
  if (!album) {
    return NextResponse.json({ error: "לא נמצא אלבום לגלריה זו" }, { status: 404 });
  }

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
      format: "jpg",
      from_page: fromPage,
      to_page: toPage,
      total_count: totalCount,
      send_to_email: email,
      // A week is plenty for a print house to pick up the file, and keeps the link from being a
      // permanent, unauthenticated way to redownload a client's paid deliverable indefinitely.
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !job) {
    return NextResponse.json({ error: error?.message ?? "שגיאה בשליחה לבית הדפוס" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  after(() => triggerAlbumExportProcessing(job.id, origin));

  return NextResponse.json({ jobId: job.id });
}
