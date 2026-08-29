import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { generateAlbumPdf } from "@/lib/albumPdf";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";

function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "אלבום";
}

// Photographers email this straight to clients, and a lot of inboxes/providers choke on (or flat
// reject) attachments much past this — 20MB is the practical "will actually arrive" ceiling.
const TARGET_MAX_BYTES = 20 * 1024 * 1024;
// Only the embedded photo JPEGs get re-encoded between passes (masked-photo/ornament/shape PNG
// layers stay lossless throughout) — for a photo-heavy album that's the dominant size driver, and
// it's the one lever generateAlbumPdf exposes without also shrinking print-page dimensions.
const QUALITY_STEPS = [90, 75, 60, 45, 30];

// A first pass already renders at the default (highest) quality — this only re-renders at
// progressively lower JPEG quality if that first PDF actually comes out over the target size, and
// stops the moment one pass fits. The downloaded original photo bytes are shared across every pass
// via the same cache (see downloadCache in albumPdf.ts), so a retry only re-pays the CPU cost of
// re-encoding, not of re-fetching every photo from storage again.
async function generatePdfUnderSizeLimit(args: Parameters<typeof generateAlbumPdf>[0]): Promise<Uint8Array> {
  const downloadCache = new Map<string, Buffer | null>();
  let best: Uint8Array | null = null;
  for (const jpegQuality of QUALITY_STEPS) {
    const bytes = await generateAlbumPdf({ ...args, jpegQuality, downloadCache });
    best = bytes;
    if (bytes.byteLength <= TARGET_MAX_BYTES) return bytes;
  }
  // Every quality step still exceeded the target — a very large/many-page album can genuinely need
  // more than that regardless of JPEG quality. Ship the smallest (lowest-quality) attempt rather
  // than failing the export outright.
  return best!;
}

export const runtime = "nodejs";
// Matches the other export routes (export-jpg/export-psd) — up to 5 size-fitting passes (see
// generatePdfUnderSizeLimit above) need real headroom beyond the single-pass 120s this used to be.
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: galleryId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;
  const supabase = createServiceRoleClient();

  // Service-role bypasses RLS, so the ownership check right here is the actual authorization
  // boundary (matters for the bearer-token/desktop path — the cookie path's own RLS would have
  // scoped this too, but a single explicit check covers both auth methods uniformly).
  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("id", galleryId)
    .maybeSingle<GalleryRow>();
  if (!gallery || gallery.photographer_id !== auth.userId) {
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

  try {
    const pdfBytes = await generatePdfUnderSizeLimit({ album: rangedAlbum, spreads: rangedSpreads, photosById, customOrnamentsById });
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
