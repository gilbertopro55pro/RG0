import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { createClient } from "@/lib/supabase/server";
import { renderAlbumPagePsd } from "@/lib/albumPsd";
import { pxFromCm } from "@/lib/albumRaster";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";

function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "אלבום";
}

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: galleryId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

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

  const photoIds = Array.from(
    new Set([
      ...(includeCover && album.cover_photo_id ? [album.cover_photo_id] : []),
      ...rangedSpreads.flatMap((s) => [s.photo_id_1, s.photo_id_2, s.background_photo_id].filter((id): id is string => !!id)),
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

  const pageWidthPx = pxFromCm(album.width_cm);
  const pageHeightPx = pxFromCm(album.height_cm);

  const rootDir = sanitizeSegment(`${album.title} - ${gallery.title}`);
  const archive = new ZipArchive({ zlib: { level: 6 } });

  (async () => {
    try {
      if (includeCover) {
        const psd = await renderAlbumPagePsd({ album, spread: null, isCover: true, pageWidthPx, pageHeightPx, photosById });
        if (psd) archive.append(psd, { name: `${rootDir}/01 - שער.psd` });
      }
      for (const spread of rangedSpreads) {
        const pageNumber = (hasCover ? 1 : 0) + spreads.indexOf(spread) + 1;
        const psd = await renderAlbumPagePsd({ album, spread, isCover: false, pageWidthPx, pageHeightPx, photosById });
        if (psd) archive.append(psd, { name: `${rootDir}/${String(pageNumber).padStart(2, "0")}.psd` });
      }
    } finally {
      archive.finalize();
    }
  })();

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="album-psd.zip"; filename*=UTF-8''${encodeURIComponent(`${rootDir}.zip`)}`,
    },
  });
}
