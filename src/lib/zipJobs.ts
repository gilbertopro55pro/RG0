import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import sharp from "sharp";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { downloadObjectBuffer, uploadObjectStream } from "@/lib/storage";
import type { GalleryFolderRow, GalleryPhotoRow, GalleryRow, GalleryZipJobRow } from "@/lib/types";

// A part is bounded by total SOURCE bytes (not a flat photo count) — that's what actually
// predicts how long a part takes, since fetching the originals from storage dominates the wall
// clock regardless of the requested output quality. Measured throughput during testing was
// roughly 100MB/s (download + zip + upload combined), so 16GB comfortably finishes inside the
// generous maxDuration set on the processing route (see api/internal/zip-jobs/process/route.ts)
// with several times that as safety margin — large enough that a "download everything" request
// on a realistic gallery (even a few thousand photos) produces ONE file instead of several, which
// only splits into parts once a gallery is genuinely enormous.
const MAX_PART_SOURCE_BYTES = 16 * 1024 ** 3;
// A secondary safety valve independent of total bytes — many thousands of small files still cost
// real time in per-file round trips (list, fetch, archive-append) even if their total size is
// modest, so a part never grows past this many photos regardless of how small they are.
const MAX_PART_PHOTO_COUNT = 3000;

// PostgREST puts an .in() filter's values in the request URL, not the body — with a part now
// holding up to MAX_PART_PHOTO_COUNT ids, querying gallery_photos for all of them in one .in()
// call can run well past common URL-length limits and silently come back empty. Used both when
// building parts (an id lookup for file sizes) and when processing one (fetching each photo's
// storage path).
const ID_QUERY_CHUNK_SIZE = 150;
export function chunkArray<T>(arr: T[], size: number = ID_QUERY_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Splits a photo list into parts, accumulating until either byte or count cap would be exceeded.
// A single very large photo still gets its own part rather than being dropped or blocking forever.
export function bucketPhotosIntoParts(photos: { id: string; file_size_bytes: number | null }[]): string[][] {
  const parts: string[][] = [];
  let current: string[] = [];
  let currentBytes = 0;
  for (const photo of photos) {
    const size = photo.file_size_bytes ?? 0;
    if (current.length > 0 && (currentBytes + size > MAX_PART_SOURCE_BYTES || current.length >= MAX_PART_PHOTO_COUNT)) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(photo.id);
    currentBytes += size;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

// Downloading the source photos from storage one at a time (as the original synchronous
// download-zip route did) is what let a 918-photo request blow past the 5-minute function limit
// mid-stream — the client got a truncated, corrupted zip with no error, since the connection was
// just cut. Fetching several at once cuts the wall-clock time by roughly this factor.
const DOWNLOAD_CONCURRENCY = 8;

// How often (in completed photos) to persist progress mid-part — frequent enough that a client
// polling every few seconds sees smooth movement, not so frequent that a several-thousand-photo
// part turns into a database write per file.
const PROGRESS_UPDATE_EVERY = 20;

const NO_FOLDER_LABEL = "כללי";

// Filesystem/zip-safe: strips characters that break directory entries on common archive tools
// (slashes would silently create extra nested folders, control chars confuse some unzippers).
export function sanitizeZipSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "תיקייה";
}

export function zipJobStoragePath(batchId: string, partIndex: number): string {
  return `zip-jobs/${batchId}/part-${partIndex + 1}.zip`;
}

// "Web quality" — resized and recompressed to land around 3MB per photo instead of the original,
// for a client who wants to browse/share rather than print. One resize pass at a size/quality
// combination that comfortably lands under the target for the vast majority of real photos, with
// a single cheaper fallback pass (lower quality, no re-resize) for the rare photo still over —
// deliberately not an iterative search for an exact byte target, which would mean several full
// re-encodes of the same image per photo.
const WEB_QUALITY_MAX_BYTES = 3 * 1024 * 1024;
async function resizeForWebQuality(buffer: Buffer): Promise<Buffer> {
  const first = await sharp(buffer)
    .rotate()
    .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  if (first.length <= WEB_QUALITY_MAX_BYTES) return first;
  return sharp(buffer).rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 68 }).toBuffer();
}

// Fires the next part's processing as a plain server-to-server request instead of calling
// processZipJobPart directly — each part needs its OWN fresh serverless invocation (and its own
// fresh maxDuration budget) rather than one invocation working through every part in sequence,
// which would hit the same time-limit problem this whole system exists to avoid.
export async function triggerZipJobProcessing(jobId: string, origin: string): Promise<void> {
  await fetch(`${origin}/api/internal/zip-jobs/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ jobId }),
  }).catch(() => {
    // Best-effort — if this particular trigger is lost (network blip, cold start timing), the
    // job stays "pending" and the retry-stuck-zip-jobs cron picks it up as a fallback.
  });
}

export async function processZipJobPart(jobId: string, origin: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: job } = await supabase
    .from("gallery_zip_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle<GalleryZipJobRow>();
  // Already picked up by another trigger (the chain and the retry cron can theoretically overlap)
  // or the job/gallery was deleted since — nothing to do either way.
  if (!job || job.status !== "pending") return;

  await supabase
    .from("gallery_zip_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  try {
    const { data: gallery } = await supabase
      .from("galleries")
      .select("*")
      .eq("id", job.gallery_id)
      .maybeSingle<GalleryRow>();
    if (!gallery) throw new Error("הגלריה לא נמצאה");

    const [photoChunkResults, { data: folders }] = await Promise.all([
      Promise.all(
        chunkArray(job.photo_ids).map((ids) =>
          supabase
            .from("gallery_photos")
            .select("storage_path, original_filename, folder_id")
            .eq("gallery_id", gallery.id)
            .in("id", ids)
            .returns<Pick<GalleryPhotoRow, "storage_path" | "original_filename" | "folder_id">[]>()
        )
      ),
      supabase
        .from("gallery_folders")
        .select("id, name")
        .eq("gallery_id", gallery.id)
        .returns<Pick<GalleryFolderRow, "id" | "name">[]>(),
    ]);
    const photos = photoChunkResults.flatMap((r) => r.data ?? []);
    if (photos.length === 0) throw new Error("התמונות לא נמצאו");

    const folderNameById = new Map((folders ?? []).map((f) => [f.id, f.name]));
    const distinctFolderIds = new Set(photos.map((p) => p.folder_id ?? null));
    const useSubfolders = distinctFolderIds.size > 1;

    const dateLabel = new Date().toLocaleDateString("he-IL");
    const partLabel = job.part_count > 1 ? ` - חלק ${job.part_index + 1}` : "";
    const rootDir = sanitizeZipSegment(`${gallery.title} - ${dateLabel}${partLabel}`);

    // "store" — no deflate — instead of the previous zlib level 6: these entries are JPEGs, which
    // are already entropy-coded and gain essentially nothing from a second compression pass. That
    // wasted pass was the real reason large parts were crashing partway through (silently, no
    // catchable error): archiver processes appended entries through an internal queue ONE AT A
    // TIME, so every deflate pass that took longer than the next photo took to download let that
    // queue fall further behind — and a queued-but-unprocessed entry holds its whole buffer in
    // memory, so the backlog grew until the function ran out of memory. Skipping compression
    // entirely (it wasn't buying anything) lets the queue drain fast enough to never build up.
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

    // Uploading has to start consuming the archive stream BEFORE (or at worst, concurrently
    // with) the append loop below — archiver has nowhere to put its compressed output except an
    // internal buffer while nothing is reading from it, so appending every photo first and only
    // starting the upload afterward meant the WHOLE compressed zip sat in memory at once while
    // waiting for finalize(). That alone wasn't the whole story though (confirmed by Vercel's own
    // "instance was killed because it ran out of available memory" runtime error persisting after
    // this fix alone): archiver queues every append() internally and only WORKS THROUGH that
    // queue one entry at a time, but append() itself never blocks — nothing stops the downloads
    // below from racing far ahead of what archiver+upload can actually drain, so buffers pile up
    // in that queue regardless of how fast each individual entry processes. bytesAppended vs
    // bytesUploaded (from the SDK's own upload-progress events) is real backpressure: the pump
    // loop pauses downloading more once it's gotten too far ahead of what's actually left R2.
    const MAX_BUFFERED_BYTES = 150 * 1024 * 1024;
    let bytesAppended = 0;
    let bytesUploaded = 0;
    const waitForUploadToCatchUp = async () => {
      while (bytesAppended - bytesUploaded > MAX_BUFFERED_BYTES) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    };

    const storagePath = zipJobStoragePath(job.batch_id, job.part_index);
    const uploadPromise = uploadObjectStream(
      "galleries",
      storagePath,
      Readable.toWeb(archive) as ReadableStream,
      "application/zip",
      (loaded) => {
        bytesUploaded = loaded;
      }
    );

    // Bounded-concurrency fan-out over a shared cursor — appends land in the archive out of
    // strict order under concurrency, which is harmless (a zip listing's order is cosmetic).
    let cursor = 0;
    let completed = 0;
    let lastPersisted = 0;
    const pump = async () => {
      while (true) {
        // Claiming the index has to happen BEFORE the first await below, with no yield point in
        // between — otherwise several concurrent workers can all pass a "cursor < photos.length"
        // check while cursor is still one below the end, then all increment past it once they
        // resume, so some of them end up reading photos[cursor] past the last valid index. That
        // was the actual cause of jobs crashing near the end of a batch (~900/918, ~98% of any
        // count) with "Cannot read properties of undefined (reading 'storage_path')" — confirmed
        // by the fact every failure landed near the array's end, not randomly throughout.
        const index = cursor++;
        if (index >= photos.length) return;
        await waitForUploadToCatchUp();
        const photo = photos[index];
        let buffer = await downloadObjectBuffer("galleries", photo.storage_path);
        if (!buffer) continue;
        if (job.quality === "web") {
          try {
            buffer = await resizeForWebQuality(buffer);
          } catch {
            // A photo sharp can't decode (corrupt upload, unsupported format) still ships at
            // full size rather than being silently dropped from the archive.
          }
        }
        const folderName = photo.folder_id ? folderNameById.get(photo.folder_id) ?? NO_FOLDER_LABEL : NO_FOLDER_LABEL;
        const dir = useSubfolders ? `${rootDir}/${sanitizeZipSegment(folderName)}` : rootDir;
        archive.append(buffer, { name: `${dir}/${uniqueName(dir, photo.original_filename)}` });
        bytesAppended += buffer.length;
        completed++;
        if (completed - lastPersisted >= PROGRESS_UPDATE_EVERY) {
          lastPersisted = completed;
          // updated_at moves forward on every progress checkpoint, not just on a final
          // status change — the stuck-job retry cron uses staleness on this same column to tell
          // "still actively working through a large part" apart from "invocation crashed".
          await supabase
            .from("gallery_zip_jobs")
            .update({ processed_count: completed, updated_at: new Date().toISOString() })
            .eq("id", jobId);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, photos.length) }, pump));
    archive.finalize();
    await uploadPromise;

    await supabase
      .from("gallery_zip_jobs")
      .update({ status: "ready", storage_path: storagePath, processed_count: photos.length, updated_at: new Date().toISOString() })
      .eq("id", jobId);
  } catch (e) {
    await supabase
      .from("gallery_zip_jobs")
      .update({
        status: "failed",
        error_message: e instanceof Error ? e.message : "שגיאה לא ידועה",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }

  const { data: nextPart } = await supabase
    .from("gallery_zip_jobs")
    .select("id")
    .eq("batch_id", job.batch_id)
    .eq("status", "pending")
    .order("part_index", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (nextPart) {
    await triggerZipJobProcessing(nextPart.id, origin);
  }
}
