import { NextResponse, type NextRequest } from "next/server";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { GalleryPhotoRow, GalleryRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Zips the requested photos and streams the archive straight through to the response instead of
// buffering the whole thing in memory first — the only way this stays within a serverless
// function's memory limits once a gallery has more than a handful of full-res photos.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { photoIds }: { photoIds: string[] } = await request.json();

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return NextResponse.json({ error: "לא נבחרו תמונות" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .eq("published", true)
    .is("archived_at", null)
    .maybeSingle<GalleryRow>();

  if (!gallery) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }
  if (!gallery.allow_downloads) {
    return NextResponse.json({ error: "הורדת תמונות מכובה עבור גלריה זו" }, { status: 403 });
  }

  const { data: photos } = await supabase
    .from("gallery_photos")
    .select("storage_path, original_filename")
    .eq("gallery_id", gallery.id)
    .in("id", photoIds)
    .returns<Pick<GalleryPhotoRow, "storage_path" | "original_filename">[]>();

  if (!photos || photos.length === 0) {
    return NextResponse.json({ error: "התמונות לא נמצאו" }, { status: 404 });
  }

  const archive = new ZipArchive({ zlib: { level: 6 } });

  const usedNames = new Set<string>();
  const uniqueName = (name: string) => {
    let candidate = name;
    let i = 1;
    while (usedNames.has(candidate)) {
      const dot = name.lastIndexOf(".");
      candidate = dot === -1 ? `${name} (${i})` : `${name.slice(0, dot)} (${i})${name.slice(dot)}`;
      i++;
    }
    usedNames.add(candidate);
    return candidate;
  };

  (async () => {
    for (const photo of photos) {
      const { data: blob } = await supabase.storage.from("galleries").download(photo.storage_path);
      if (!blob) continue;
      const buffer = Buffer.from(await blob.arrayBuffer());
      archive.append(buffer, { name: uniqueName(photo.original_filename) });
    }
    archive.finalize();
  })();

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="gallery-photos.zip"`,
    },
  });
}
