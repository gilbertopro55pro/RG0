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

  const photoIds = Array.from(
    new Set([
      ...(album.cover_photo_id ? [album.cover_photo_id] : []),
      ...spreads.flatMap((s) => [s.photo_id_1, s.photo_id_2].filter((id): id is string => !!id)),
      // Custom-layout spreads can reference photos that never touch photo_id_1/photo_id_2 at all.
      ...spreads.flatMap((s) => s.elements.filter((el) => el.type === "photo").map((el) => el.photoId)),
    ])
  );
  const { data: photos } = await supabase
    .from("gallery_photos")
    .select("id, storage_path")
    .in("id", photoIds)
    .returns<Pick<GalleryPhotoRow, "id" | "storage_path">[]>();
  const photosById = new Map((photos ?? []).map((p) => [p.id, p]));

  try {
    const pdfBytes = await generateAlbumPdf({ album, spreads, photosById });
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
