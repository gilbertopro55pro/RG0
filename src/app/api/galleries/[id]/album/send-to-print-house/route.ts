import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { enqueuePrintHouseSend } from "@/lib/printHouseSend";
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

  const body: { email?: string; from?: number; to?: number; notes?: string } = await request.json().catch(() => ({}));
  // Free-text instructions for the print house, capped so the email stays sane.
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
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
  const result = await enqueuePrintHouseSend(supabase, {
    galleryId: gallery.id,
    albumId: album.id,
    photographerId: gallery.photographer_id,
    email,
    notes,
    from: fromPage,
    to: toPage,
    origin: new URL(request.url).origin,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ jobId: result.jobId });
}
