import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAlbumPdf } from "@/lib/albumPdf";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";

function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "אלבום";
}

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: galleryId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  // RLS (galleries_all_own-style owner policy) already scopes this to the caller's own gallery —
  // a gallery belonging to someone else simply comes back null, same as "not found".
  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("id", galleryId)
    .maybeSingle<GalleryRow>();
  if (!gallery) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  const { data: album } = await supabase
    .from("gallery_albums")
    .select("*")
    .eq("gallery_id", galleryId)
    .maybeSingle<GalleryAlbumRow>();
  if (!album) {
    return NextResponse.json({ error: "לא נמצא אלבום לגלריה זו" }, { status: 404 });
  }

  const { data: spreads } = await supabase
    .from("gallery_album_spreads")
    .select("*")
    .eq("album_id", album.id)
    .order("sort_order", { ascending: true })
    .returns<GalleryAlbumSpreadRow[]>();
  if (!spreads || spreads.length === 0) {
    return NextResponse.json({ error: "אין עדיין עמודים באלבום" }, { status: 400 });
  }

  // Page range from the "which pages to export" modal — page 1 is the cover (when present),
  // then each spread follows in sort order. Falls back to the full album when the caller sends
  // no body (or an unparseable one).
  const body: { from?: number; to?: number } = await request.json().catch(() => ({}));
  const hasCover = !!album.cover_photo_id;
  const totalPages = (hasCover ? 1 : 0) + spreads.length;
  const rangeStart = Math.max(1, Math.min(body.from ?? 1, body.to ?? totalPages, totalPages));
  const rangeEnd = Math.max(rangeStart, Math.min(Math.max(body.from ?? 1, body.to ?? totalPages), totalPages));
  const includeCover = hasCover && rangeStart <= 1;
  const rangedSpreads = spreads
    .map((spread, i) => ({ spread, pageNumber: (hasCover ? 1 : 0) + i + 1 }))
    .filter(({ pageNumber }) => pageNumber >= rangeStart && pageNumber <= rangeEnd)
    .map(({ spread }) => spread);
  const rangedAlbum: GalleryAlbumRow = includeCover ? album : { ...album, cover_photo_id: null };

  const photoIds = Array.from(
    new Set([
      ...(includeCover && album.cover_photo_id ? [album.cover_photo_id] : []),
      ...rangedSpreads.flatMap((s) => [s.photo_id_1, s.photo_id_2, s.background_photo_id].filter((id): id is string => !!id)),
      // Custom-layout spreads can reference photos that never touch photo_id_1/photo_id_2 at all.
      // An empty frame (photoId null — not yet assigned) has nothing to fetch.
      ...rangedSpreads.flatMap((s) =>
        s.elements.filter((el): el is typeof el & { type: "photo"; photoId: string } => el.type === "photo" && !!el.photoId).map((el) => el.photoId)
      ),
    ])
  );
  const { data: photos } = await supabase
    .from("gallery_photos")
    .select("id, storage_path")
    .in("id", photoIds)
    .returns<Pick<GalleryPhotoRow, "id" | "storage_path">[]>();
  const photosById = new Map((photos ?? []).map((p) => [p.id, p]));

  try {
    const pdfBytes = await generateAlbumPdf({ album: rangedAlbum, spreads: rangedSpreads, photosById });
    const filename = sanitizeSegment(`${album.title} - ${gallery.title}`);
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="album.pdf"; filename*=UTF-8''${encodeURIComponent(`${filename}.pdf`)}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `יצירת ה-PDF נכשלה: ${e.message}` : "יצירת ה-PDF נכשלה" },
      { status: 500 }
    );
  }
}
