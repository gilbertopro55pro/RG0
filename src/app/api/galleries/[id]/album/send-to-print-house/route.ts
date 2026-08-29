import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { PassThrough } from "node:stream";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { renderAlbumPageJpeg, pxFromCm } from "@/lib/albumRaster";
import { uploadObject, getSignedDownloadUrl } from "@/lib/storage";
import { sendEmail } from "@/lib/resend";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";

function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "אלבום";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const runtime = "nodejs";
export const maxDuration = 300;

// Only JPG ever goes to a print house from here (not PDF/PSD) — the album's own working files,
// not a print-ready deliverable format. Mirrors export-jpg/route.ts's page-gathering logic
// (kept separate rather than shared, since this route needs a buffered zip to upload + email a
// link to, while the download route streams straight to the browser and is left untouched).
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

  const { data: spreads } = await supabase
    .from("gallery_album_spreads")
    .select("*")
    .eq("album_id", album.id)
    .order("sort_order", { ascending: true })
    .returns<GalleryAlbumSpreadRow[]>();
  if (!spreads || spreads.length === 0) {
    return NextResponse.json({ error: "אין עדיין עמודים באלבום" }, { status: 400 });
  }

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

  const customOrnamentIds = Array.from(
    new Set(
      rangedSpreads.flatMap((s) =>
        s.elements.filter((el): el is typeof el & { type: "ornament"; customOrnamentId: string } => el.type === "ornament" && !!el.customOrnamentId).map((el) => el.customOrnamentId)
      )
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

  const pageWidthPx = pxFromCm(album.width_cm);
  const pageHeightPx = pxFromCm(album.height_cm);
  const rootDir = sanitizeSegment(`${album.title} - ${gallery.title}`);

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  const collected = new Promise<void>((resolve, reject) => {
    const pass = new PassThrough();
    pass.on("data", (chunk: Buffer) => chunks.push(chunk));
    pass.on("end", resolve);
    pass.on("error", reject);
    archive.on("error", reject);
    archive.pipe(pass);
  });

  if (includeCover) {
    const jpeg = await renderAlbumPageJpeg({ album, spread: null, isCover: true, pageWidthPx, pageHeightPx, photosById, customOrnamentsById });
    if (jpeg) archive.append(jpeg, { name: `${rootDir}/01 - שער.jpg` });
  }
  for (const spread of rangedSpreads) {
    const pageNumber = (hasCover ? 1 : 0) + spreads.indexOf(spread) + 1;
    const spreadWidthPx = spread.width_cm ? pxFromCm(spread.width_cm) : pageWidthPx;
    const spreadHeightPx = spread.height_cm ? pxFromCm(spread.height_cm) : pageHeightPx;
    const jpeg = await renderAlbumPageJpeg({ album, spread, isCover: false, pageWidthPx: spreadWidthPx, pageHeightPx: spreadHeightPx, photosById, customOrnamentsById });
    if (jpeg) archive.append(jpeg, { name: `${rootDir}/${String(pageNumber).padStart(2, "0")}.jpg` });
  }
  archive.finalize();
  await collected;
  const zipBuffer = Buffer.concat(chunks);

  const storagePath = `print-house-exports/${gallery.id}/${Date.now()}-${rootDir}.zip`;
  await uploadObject("galleries", storagePath, zipBuffer, "application/zip");
  // A week is plenty for a print house to pick up the file, and keeps the link from being a
  // permanent, unauthenticated way to redownload a client's paid deliverable indefinitely.
  const downloadUrl = await getSignedDownloadUrl("galleries", storagePath, 60 * 60 * 24 * 7, `${rootDir}.zip`);

  await sendEmail({
    to: email,
    subject: `קבצי הדפסה — ${album.title}`,
    text: `שלום,\n\nמצורף קישור להורדת קובצי ה-JPG להדפסה עבור האלבום "${album.title}" (${gallery.title}):\n${downloadUrl}\n\nהקישור בתוקף לשבוע ימים.`,
  });

  return NextResponse.json({ ok: true });
}
