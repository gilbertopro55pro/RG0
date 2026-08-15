import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { createClient } from "@/lib/supabase/server";
import { renderAlbumPageJpeg, pxFromCm } from "@/lib/albumRaster";
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

  const photoIds = Array.from(
    new Set([
      ...(album.cover_photo_id ? [album.cover_photo_id] : []),
      ...spreads.flatMap((s) => [s.photo_id_1, s.photo_id_2].filter((id): id is string => !!id)),
      ...spreads.flatMap((s) =>
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
      let pageNum = 1;
      if (album.cover_photo_id) {
        const jpeg = await renderAlbumPageJpeg({ album, spread: null, isCover: true, pageWidthPx, pageHeightPx, photosById });
        if (jpeg) {
          archive.append(jpeg, { name: `${rootDir}/${String(pageNum).padStart(2, "0")} - שער.jpg` });
          pageNum++;
        }
      }
      for (const spread of spreads) {
        const jpeg = await renderAlbumPageJpeg({ album, spread, isCover: false, pageWidthPx, pageHeightPx, photosById });
        if (jpeg) {
          archive.append(jpeg, { name: `${rootDir}/${String(pageNum).padStart(2, "0")}.jpg` });
          pageNum++;
        }
      }
    } finally {
      archive.finalize();
    }
  })();

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="album-jpg.zip"; filename*=UTF-8''${encodeURIComponent(`${rootDir}.zip`)}`,
    },
  });
}
