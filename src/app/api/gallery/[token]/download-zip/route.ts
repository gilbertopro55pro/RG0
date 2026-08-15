import { NextResponse, type NextRequest } from "next/server";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { downloadObjectBuffer } from "@/lib/storage";
import type { GalleryFolderRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";

const NO_FOLDER_LABEL = "כללי";

// Filesystem/zip-safe: strips characters that break directory entries on common archive tools
// (slashes would silently create extra nested folders, control chars confuse some unzippers).
function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "תיקייה";
}

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

  const [{ data: photos }, { data: folders }] = await Promise.all([
    supabase
      .from("gallery_photos")
      .select("storage_path, original_filename, folder_id")
      .eq("gallery_id", gallery.id)
      .in("id", photoIds)
      .returns<Pick<GalleryPhotoRow, "storage_path" | "original_filename" | "folder_id">[]>(),
    supabase
      .from("gallery_folders")
      .select("id, name")
      .eq("gallery_id", gallery.id)
      .returns<Pick<GalleryFolderRow, "id" | "name">[]>(),
  ]);

  if (!photos || photos.length === 0) {
    return NextResponse.json({ error: "התמונות לא נמצאו" }, { status: 404 });
  }

  const folderNameById = new Map((folders ?? []).map((f) => [f.id, f.name]));
  const distinctFolderIds = new Set(photos.map((p) => p.folder_id ?? null));
  // Only nest into per-tab subfolders when the selection actually spans more than one tab —
  // a single-tab (or tab-less) download stays a flat archive, matching what the person expects
  // from downloading "the photos", not an empty layer of folders around them.
  const useSubfolders = distinctFolderIds.size > 1;

  const dateLabel = new Date().toLocaleDateString("he-IL");
  const rootDir = sanitizeSegment(`${gallery.title} - ${dateLabel}`);

  const archive = new ZipArchive({ zlib: { level: 6 } });

  const usedNamesByDir = new Map<string, Set<string>>();
  const uniqueName = (dir: string, name: string) => {
    let usedNames = usedNamesByDir.get(dir);
    if (!usedNames) {
      usedNames = new Set<string>();
      usedNamesByDir.set(dir, usedNames);
    }
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
      const buffer = await downloadObjectBuffer("galleries", photo.storage_path);
      if (!buffer) continue;
      const folderName = photo.folder_id ? folderNameById.get(photo.folder_id) ?? NO_FOLDER_LABEL : NO_FOLDER_LABEL;
      const dir = useSubfolders ? `${rootDir}/${sanitizeSegment(folderName)}` : rootDir;
      archive.append(buffer, { name: `${dir}/${uniqueName(dir, photo.original_filename)}` });
    }
    archive.finalize();
  })();

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      // A plain ASCII fallback plus the real (Hebrew) name via the UTF-8 filename* form — a bare
      // non-ASCII filename= value is invalid per RFC 6266 and some browsers mishandle it.
      "Content-Disposition": `attachment; filename="gallery-photos.zip"; filename*=UTF-8''${encodeURIComponent(`${rootDir}.zip`)}`,
    },
  });
}
