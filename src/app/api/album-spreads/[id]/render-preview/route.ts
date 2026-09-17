import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadObject } from "@/lib/storage";
import { renderAlbumPageJpeg, pxFromCm } from "@/lib/albumRaster";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow } from "@/lib/types";

export const runtime = "nodejs";

// Renders ONE spread to a real JPEG via the same raster pipeline the JPG/PSD/PDF exports use — not
// the editor's own live CSS preview (canvas + AlbumSpreadThumbnail), which is always in sync since
// it's driven directly from `elements`, but is a browser CSS approximation of the render, not the
// render itself (fonts especially can differ — see albumRaster.ts's own comment on why text is
// rasterized via glyph outlines rather than relying on any font-shaping engine). Stores the result
// at a stable per-spread path, overwritten on every call (not versioned) — the editor calls this on
// both entering and leaving a spread (see AlbumSpreadCanvasEditor.tsx) so this snapshot never goes
// stale for long, per explicit request. Fast enough (a single page, same renderAlbumPageJpeg the
// JPG/PSD export route already runs synchronously on Vercel) that this doesn't need the
// job-queue+polling machinery the full multi-page album export uses.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: spreadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { data: spread } = await supabase.from("gallery_album_spreads").select("*").eq("id", spreadId).maybeSingle<GalleryAlbumSpreadRow>();
  if (!spread) return NextResponse.json({ error: "העמוד לא נמצא" }, { status: 404 });

  const { data: album } = await supabase.from("gallery_albums").select("*").eq("id", spread.album_id).maybeSingle<GalleryAlbumRow>();
  if (!album || album.photographer_id !== user.id) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const photoIds = Array.from(
    new Set(
      [
        spread.photo_id_1,
        spread.photo_id_2,
        spread.background_photo_id,
        ...spread.elements.filter((el): el is typeof el & { type: "photo"; photoId: string } => el.type === "photo" && !!el.photoId).map((el) => el.photoId),
      ].filter((id): id is string => !!id)
    )
  );
  const { data: photos } = await supabase
    .from("gallery_photos")
    .select("id, storage_path")
    .in("id", photoIds.length > 0 ? photoIds : [""])
    .returns<Pick<GalleryPhotoRow, "id" | "storage_path">[]>();
  const photosById = new Map((photos ?? []).map((p) => [p.id, p]));

  const customOrnamentIds = Array.from(
    new Set(
      spread.elements
        .filter((el): el is typeof el & { type: "ornament"; customOrnamentId: string } => el.type === "ornament" && !!el.customOrnamentId)
        .map((el) => el.customOrnamentId)
    )
  );
  let customOrnamentsById: Map<string, { storage_path: string }> | undefined;
  if (customOrnamentIds.length > 0) {
    const { data: customOrnaments } = await supabase
      .from("custom_ornaments")
      .select("id, storage_path")
      .in("id", customOrnamentIds)
      .returns<{ id: string; storage_path: string }[]>();
    customOrnamentsById = new Map((customOrnaments ?? []).map((o) => [o.id, { storage_path: o.storage_path }]));
  }

  const pageWidthPx = pxFromCm(spread.width_cm ?? album.width_cm);
  const pageHeightPx = pxFromCm(spread.height_cm ?? album.height_cm);

  try {
    const buf = await renderAlbumPageJpeg({ album, spread, isCover: false, pageWidthPx, pageHeightPx, photosById, customOrnamentsById });
    if (!buf) return NextResponse.json({ error: "רינדור נכשל" }, { status: 500 });
    const storagePath = `album-previews/${spread.id}.jpg`;
    await uploadObject("galleries", storagePath, buf, "image/jpeg");
    await supabase.from("gallery_album_spreads").update({ preview_storage_path: storagePath, preview_updated_at: new Date().toISOString() }).eq("id", spread.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[render-preview] failed", e);
    return NextResponse.json({ error: "רינדור נכשל" }, { status: 500 });
  }
}
