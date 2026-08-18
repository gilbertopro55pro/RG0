import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { createClient } from "@/lib/supabase/server";
import { generateAlbumPageJsx, type AlbumJsxPageElement } from "@/lib/albumJsx";
import { pxFromCm, DPI } from "@/lib/albumRaster";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";

function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "אלבום";
}

export const runtime = "nodejs";
export const maxDuration = 60;

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

  // Same page-numbering convention as the JPG/PSD/PDF export routes: the cover (if the album has
  // one) counts as page 1, then each spread follows in sort order. The cover isn't a spread with
  // an `elements` array, so it's not translatable into this beta's per-element script yet — it's
  // silently excluded from the range rather than erroring the whole export.
  const body: { from?: number; to?: number } = await request.json().catch(() => ({}));
  const hasCover = !!album.cover_photo_id;
  const totalPages = (hasCover ? 1 : 0) + spreads.length;
  const rangeStart = Math.max(1, Math.min(body.from ?? 1, body.to ?? totalPages, totalPages));
  const rangeEnd = Math.max(rangeStart, Math.min(Math.max(body.from ?? 1, body.to ?? totalPages), totalPages));
  const rangedSpreads = spreads
    .map((spread, i) => ({ spread, pageNumber: (hasCover ? 1 : 0) + i + 1 }))
    .filter(({ pageNumber }) => pageNumber >= rangeStart && pageNumber <= rangeEnd)
    .map(({ spread }) => spread);
  if (rangedSpreads.length === 0) {
    return NextResponse.json({ error: "הטווח שנבחר מכיל רק את עמוד השער, שעדיין לא נתמך בייצוא הזה — בחר/י טווח שכולל לפחות עמוד תוכן אחד" }, { status: 400 });
  }

  const photoIds = Array.from(
    new Set(
      rangedSpreads.flatMap((s) =>
        s.elements.filter((el): el is typeof el & { type: "photo"; photoId: string } => el.type === "photo" && !!el.photoId).map((el) => el.photoId)
      )
    )
  );
  const { data: photos } = await supabase
    .from("gallery_photos")
    .select("id, original_filename")
    .in("id", photoIds)
    .returns<Pick<GalleryPhotoRow, "id" | "original_filename">[]>();
  const photosById = new Map((photos ?? []).map((p) => [p.id, p]));

  const pageWidthPx = pxFromCm(album.width_cm);
  const pageHeightPx = pxFromCm(album.height_cm);

  const rootDir = sanitizeSegment(`${album.title} - ${gallery.title}`);
  const archive = new ZipArchive({ zlib: { level: 6 } });

  (async () => {
    try {
      for (const spread of rangedSpreads) {
        const pageNumber = (hasCover ? 1 : 0) + spreads.indexOf(spread) + 1;
        const elements: AlbumJsxPageElement[] = [];
        let skippedExtrasCount = 0;
        let skippedTextCount = 0;
        for (const el of spread.elements) {
          if (el.type === "text") {
            skippedTextCount++;
            continue;
          }
          if (!el.photoId) continue;
          const photo = photosById.get(el.photoId);
          if (!photo) continue;
          if (el.maskId || el.borderWidth || el.rotation || el.shadow) skippedExtrasCount++;
          elements.push({
            photoId: el.photoId,
            filename: photo.original_filename,
            xPct: el.xPct,
            yPct: el.yPct,
            widthPct: el.widthPct,
            heightPct: el.heightPct,
            focalX: el.focalX,
            focalY: el.focalY,
          });
        }
        const jsx = generateAlbumPageJsx({
          pageLabel: `${String(pageNumber).padStart(2, "0")}`,
          widthPx: pageWidthPx,
          heightPx: pageHeightPx,
          dpi: DPI,
          elements,
          skippedTextCount,
          skippedExtrasCount,
        });
        archive.append(Buffer.from(jsx, "utf8"), { name: `${rootDir}/${String(pageNumber).padStart(2, "0")}.jsx` });
      }
    } finally {
      archive.finalize();
    }
  })();

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="album-jsx.zip"; filename*=UTF-8''${encodeURIComponent(`${rootDir}.zip`)}`,
    },
  });
}
