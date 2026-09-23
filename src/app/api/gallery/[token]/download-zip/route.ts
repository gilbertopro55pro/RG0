import { NextResponse, type NextRequest } from "next/server";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { downloadObjectBuffer } from "@/lib/storage";
import type { GalleryFolderRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";

const NO_FOLDER_LABEL = "כללי";

// Filesystem/zip-safe: strips characters that break directory entries on common archive tools
// (slashes would silently create extra nested folders, control chars confuse some unzippers).
function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "תיקייה";
}

// PostgREST puts an .in() filter's values in the request URL, not the body — a "download all"
// on a gallery with hundreds of photos built a URL well past common length limits, which
// silently came back as zero rows (this ran the SAME query since before the wa.me/form-POST
// work, just never with enough ids at once to hit it). Chunking keeps each request safely small
// regardless of how many ids are selected.
const PHOTO_ID_CHUNK_SIZE = 150;
// Largest selection this inline route will serve — see the guard below.
const MAX_INLINE_PHOTOS = 60;
const MAX_INLINE_BYTES = 600 * 1024 * 1024;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const runtime = "nodejs";
export const maxDuration = 300;

// Zips the requested photos and streams the archive straight through to the response instead of
// buffering the whole thing in memory first — the only way this stays within a serverless
// function's memory limits once a gallery has more than a handful of full-res photos.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // The client-facing gallery (PublicGalleryView) submits a real form POST instead of fetch+JSON
  // so the browser streams the response straight to disk instead of buffering the whole zip in
  // JS memory first — large galleries were silently hanging on mobile because of that. The
  // photographer's own view (GalleryManageView) still calls this with fetch+JSON, so both are
  // accepted here based on the request's content type.
  const contentType = request.headers.get("content-type") ?? "";
  let photoIds: string[] = [];
  if (contentType.includes("application/json")) {
    ({ photoIds } = await request.json());
  } else {
    const form = await request.formData();
    try {
      photoIds = JSON.parse(String(form.get("photoIds") ?? "[]"));
    } catch {
      photoIds = [];
    }
  }

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return NextResponse.json({ error: "לא נבחרו תמונות" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .maybeSingle<GalleryRow>();

  if (!gallery) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  // The photographer downloading their own gallery (e.g. exporting the client's favorites for
  // retouching) isn't bound by the client-facing publish/downloads-enabled gates — those settings
  // control what the client can see, not what the photographer can do with their own data.
  const serverAuthClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await serverAuthClient.auth.getUser();
  const isOwner = !!user && user.id === gallery.photographer_id;

  if (!isOwner) {
    if (!gallery.published || gallery.archived_at) {
      return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
    }
    if (!gallery.allow_downloads) {
      return NextResponse.json({ error: "הורדת תמונות מכובה עבור גלריה זו" }, { status: 403 });
    }
  }

  const [photoChunkResults, { data: folders }] = await Promise.all([
    Promise.all(
      chunk(photoIds, PHOTO_ID_CHUNK_SIZE).map((ids) => {
        let q = supabase
          .from("gallery_photos")
          .select("storage_path, original_filename, folder_id, file_size_bytes")
          .eq("gallery_id", gallery.id)
          .in("id", ids);
        // A rejected photo's id is never offered by the client-facing gallery UI, but nothing
        // stops a direct request for one by id — only the owner can pull rejected photos.
        if (!isOwner) q = q.neq("culling_status", "rejected");
        return q.returns<Pick<GalleryPhotoRow, "storage_path" | "original_filename" | "folder_id" | "file_size_bytes">[]>();
      })
    ),
    supabase
      .from("gallery_folders")
      .select("id, name")
      .eq("gallery_id", gallery.id)
      .returns<Pick<GalleryFolderRow, "id" | "name">[]>(),
  ]);
  const photos = photoChunkResults.flatMap((r) => r.data ?? []);

  if (photos.length === 0) {
    return NextResponse.json({ error: "התמונות לא נמצאו" }, { status: 404 });
  }

  // This route streams the whole archive inside ONE request, which only holds up for a modest
  // selection: confirmed live (2026-09-20) that 150 favorites (~1.7GB) made the function die a few
  // seconds in, after ~1.8MB — an HTTP 200 with a truncated, unopenable ZIP (macOS "Error 94 - Bad
  // message"). Every current caller sends anything big to the background zip-job system instead
  // (/zip-jobs); this guard is the safety net for a stale page/old app version, so an oversized
  // request fails with a clear message instead of silently producing a corrupt file.
  const totalBytes = photos.reduce((sum, p) => sum + (p.file_size_bytes ?? 0), 0);
  if (photos.length > MAX_INLINE_PHOTOS || totalBytes > MAX_INLINE_BYTES) {
    return NextResponse.json(
      { error: "הבחירה גדולה מדי להורדה ישירה. יש לרענן את הדף ולנסות שוב (ההורדה תתבצע ברקע)" },
      { status: 413 }
    );
  }

  const folderNameById = new Map((folders ?? []).map((f) => [f.id, f.name]));
  const distinctFolderIds = new Set(photos.map((p) => p.folder_id ?? null));
  // Only nest into per-tab subfolders when the selection actually spans more than one tab —
  // a single-tab (or tab-less) download stays a flat archive, matching what the person expects
  // from downloading "the photos", not an empty layer of folders around them.
  const useSubfolders = distinctFolderIds.size > 1;

  const dateLabel = new Date().toLocaleDateString("he-IL");
  const rootDir = sanitizeSegment(`${gallery.title} - ${dateLabel}`);

  // store: JPEGs are already compressed, so deflate only burns CPU and lets the append queue (and its
  // buffers) pile up in memory — the same fix the background zip jobs already use.
  const archive = new ZipArchive({ store: true });

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
    // Fetching source files one at a time here is what let a large selection blow past this
    // function's time limit mid-stream — the connection just gets cut with no error, leaving the
    // client with a truncated, corrupted zip. Fetching several at once cuts the wall-clock time
    // roughly proportionally; append order under concurrency doesn't matter (a zip listing's
    // order is cosmetic). Genuinely huge downloads (a full gallery with hundreds/thousands of
    // photos) go through the background job system instead — see zip-jobs/route.ts.
    let cursor = 0;
    const pump = async () => {
      while (cursor < photos.length) {
        const photo = photos[cursor++];
        const buffer = await downloadObjectBuffer("galleries", photo.storage_path);
        if (!buffer) continue;
        const folderName = photo.folder_id ? folderNameById.get(photo.folder_id) ?? NO_FOLDER_LABEL : NO_FOLDER_LABEL;
        const dir = useSubfolders ? `${rootDir}/${sanitizeSegment(folderName)}` : rootDir;
        archive.append(buffer, { name: `${dir}/${uniqueName(dir, photo.original_filename)}` });
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, photos.length) }, pump));
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
