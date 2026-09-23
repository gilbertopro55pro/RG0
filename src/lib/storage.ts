import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// No timeout is configured by default on the AWS SDK v3 Node HTTP handler — a request whose
// connection genuinely stalls (a rare but real R2-side or network blip) hangs the `await` forever
// instead of throwing, which is invisible to any try/catch and un-loggable by definition (nothing
// ever happens for it to log). Found 2026-09-01 chasing album PDF exports that silently froze
// mid-render with no error, no crash, and no further progress ever again — a hung
// downloadObjectBuffer call inside the page-render loop is exactly what that looks like from the
// outside. These timeouts turn a silent infinite hang into a real, catchable error within seconds,
// so a stalled export actually fails (and gets picked up by the retry-stuck-jobs cron) instead of
// sitting frozen "processing" forever.
const R2_REQUEST_HANDLER = { connectionTimeout: 5000, requestTimeout: 30000 };

// AWS SDK v3 (since ~3.729) adds a default CRC32 checksum to requests — and to PRESIGNED PutObject
// URLs it bakes in `x-amz-checksum-crc32=AAAAAA==`, the checksum of an EMPTY body, since the real
// file isn't known at signing time. R2 now validates that against the bytes the browser actually
// uploads, so every browser upload via getSignedUploadUrl was rejected, and the rejection lacks
// CORS headers, so it surfaced client-side only as a bare "שגיאת רשת" (confirmed 2026-09-23 — broke
// gallery, portfolio and client uploads at once, with no code change on our side). Only compute a
// checksum where an operation genuinely requires one.
const R2_CHECKSUM_CONFIG = { requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" } as const;

let cachedClient: S3Client | null = null;
function client(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: requireEnv("R2_ENDPOINT"),
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
      requestHandler: R2_REQUEST_HANDLER,
      ...R2_CHECKSUM_CONFIG,
    });
  }
  return cachedClient;
}

// Separate bucket, separate client, separate credentials — deliberately never the same as the
// private bucket above. This one is public (served via its own r2.dev domain) and holds ONLY
// compressed preview/thumbnail copies, never originals, so exposing it publicly never risks the
// paid full-resolution deliverables. See galleryPhotoPreview.ts for why this exists: a stable,
// unsigned URL is cacheable by the browser AND Cloudflare's edge across reloads and across
// different visitors, unlike a freshly-signed URL that changes (and so never hits cache) every
// single time it's generated.
let cachedPreviewsClient: S3Client | null = null;
function previewsClient(): S3Client {
  if (!cachedPreviewsClient) {
    cachedPreviewsClient = new S3Client({
      region: "auto",
      endpoint: requireEnv("R2_ENDPOINT"),
      credentials: {
        accessKeyId: requireEnv("R2_PREVIEWS_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_PREVIEWS_SECRET_ACCESS_KEY"),
      },
      requestHandler: R2_REQUEST_HANDLER,
      ...R2_CHECKSUM_CONFIG,
    });
  }
  return cachedPreviewsClient;
}

export function getPublicPreviewUrl(path: string): string {
  return `${requireEnv("R2_PREVIEWS_PUBLIC_URL")}/${path}`;
}

// Uploads to the public previews bucket and returns a stable, permanent URL — no signing, no
// expiry, safe to cache forever (`immutable`) since a preview's content never changes once
// generated (a re-processed photo gets a new path, it never overwrites the old one in place).
export async function uploadPublicPreview(path: string, body: Buffer | Uint8Array, contentType: string): Promise<string> {
  await previewsClient().send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_PREVIEWS_BUCKET_NAME"),
      Key: path,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return getPublicPreviewUrl(path);
}

// One R2 bucket holds everything; `bucket` here is kept only as a key prefix so it maps 1:1
// onto the two separate Supabase Storage buckets ("galleries", "album-designs") this replaced —
// existing storage_path values in the DB stay valid unchanged, just resolved under a prefix now.
function keyFor(bucket: string, path: string): string {
  return `${bucket}/${path}`;
}

export async function uploadObject(
  bucket: string,
  path: string,
  body: Buffer | Uint8Array,
  contentType?: string
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Key: keyFor(bucket, path),
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getSignedDownloadUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number,
  downloadFilename?: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: keyFor(bucket, path),
    ...(downloadFilename
      ? { ResponseContentDisposition: `attachment; filename="${encodeURIComponent(downloadFilename)}"` }
      : {}),
  });
  return getSignedUrl(client(), command, { expiresIn: expiresInSeconds });
}

export async function getSignedDownloadUrls(
  bucket: string,
  paths: string[],
  expiresInSeconds: number
): Promise<{ path: string; signedUrl: string }[]> {
  return Promise.all(
    paths.map(async (path) => ({
      path,
      signedUrl: await getSignedDownloadUrl(bucket, path, expiresInSeconds),
    }))
  );
}

export async function downloadObjectBuffer(bucket: string, path: string): Promise<Buffer | null> {
  try {
    // A manual timeout wrapped around the WHOLE call, not just relying on R2_REQUEST_HANDLER above
    // — that one only bounds the connection + initial-response phase; a response that starts fine
    // but whose BODY stream then stalls partway through (still a real, if rarer, network failure
    // mode) can hang inside transformToByteArray() independently of that. Found 2026-09-01 chasing
    // album PDF exports that froze silently mid-render on a heavy multi-photo page with zero error,
    // zero crash, and zero further progress ever again — consistent with exactly this kind of stall,
    // which the request-level timeout alone didn't fully cover.
    const bytes = await Promise.race([
      (async () => {
        const res = await client().send(
          new GetObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: keyFor(bucket, path) })
        );
        if (!res.Body) return null;
        return res.Body.transformToByteArray();
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`downloadObjectBuffer timed out after 40s for ${bucket}/${path}`)), 40000)
      ),
    ]);
    return bytes ? Buffer.from(bytes) : null;
  } catch (e) {
    // Every caller (album PDF/JPG/PSD export) treats a null return as "this element just has no
    // photo" and silently skips it — which used to mean a real fetch failure (wrong path, R2
    // outage, permissions, or now a timeout) looked identical to "nothing to render" with zero trace
    // anywhere. This at least surfaces it in the server logs without changing the null-means-skip
    // contract callers already rely on.
    console.error(`downloadObjectBuffer failed for ${bucket}/${path}`, e);
    return null;
  }
}

// Multipart streaming upload — the body is consumed as it's produced (e.g. a zip archive being
// written to) instead of needing the whole thing buffered in memory first, which matters once a
// gallery zip runs into the gigabytes. Takes a web ReadableStream (Readable.toWeb(nodeStream)) —
// the AWS SDK's own type-check on Upload's Body param doesn't recognize a raw archiver instance
// as a valid Readable even though it structurally is one, but does accept a converted web stream.
export async function uploadObjectStream(
  bucket: string,
  path: string,
  body: ReadableStream,
  contentType?: string,
  // Reports total bytes actually sent to R2 so far — lets a caller producing the stream (e.g. a
  // zip archive being written to) throttle itself to how fast the upload is actually draining,
  // instead of racing ahead and piling up unconsumed data in memory.
  onProgress?: (bytesUploaded: number) => void
): Promise<void> {
  const upload = new Upload({
    client: client(),
    params: {
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Key: keyFor(bucket, path),
      Body: body,
      ContentType: contentType,
    },
  });
  if (onProgress) {
    upload.on("httpUploadProgress", (progress) => {
      if (typeof progress.loaded === "number") onProgress(progress.loaded);
    });
  }
  await upload.done();
}

// S3/R2's DeleteObjectsCommand caps out at 1000 keys per request — a gallery bulk-delete easily
// exceeds that (each photo contributes up to 2 keys, storage_path + preview_storage_path), so a
// single unchunked call would throw and silently leave every object in that batch un-deleted.
const DELETE_OBJECTS_BATCH_SIZE = 1000;

export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  for (let i = 0; i < paths.length; i += DELETE_OBJECTS_BATCH_SIZE) {
    const batch = paths.slice(i, i + DELETE_OBJECTS_BATCH_SIZE);
    const result = await client().send(
      new DeleteObjectsCommand({
        Bucket: requireEnv("R2_BUCKET_NAME"),
        Delete: { Objects: batch.map((path) => ({ Key: keyFor(bucket, path) })) },
      })
    );
    if (result.Errors && result.Errors.length > 0) {
      throw new Error(`מחיקת ${result.Errors.length} קבצים מהאחסון נכשלה: ${result.Errors.map((e) => e.Key).join(", ")}`);
    }
  }
}

// Previews live in the separate public previews bucket (see previewsClient() above) under their
// own credentials — never the same bucket/client as removeObjects, and never wrapped in keyFor()
// since uploadPublicPreview() writes them with the bare "previews/<galleryId>/<photoId>.webp" key,
// no bucket-name prefix. Deleting a gallery photo used to lump its preview path into the same
// removeObjects("galleries", ...) call, which silently did nothing (the key never existed in that
// bucket) — this is the real deletion path for it.
export async function removePreviewObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  for (let i = 0; i < paths.length; i += DELETE_OBJECTS_BATCH_SIZE) {
    const batch = paths.slice(i, i + DELETE_OBJECTS_BATCH_SIZE);
    const result = await previewsClient().send(
      new DeleteObjectsCommand({
        Bucket: requireEnv("R2_PREVIEWS_BUCKET_NAME"),
        Delete: { Objects: batch.map((path) => ({ Key: path })) },
      })
    );
    if (result.Errors && result.Errors.length > 0) {
      throw new Error(`מחיקת ${result.Errors.length} תצוגות מקדימות נכשלה: ${result.Errors.map((e) => e.Key).join(", ")}`);
    }
  }
}

// Lets the browser upload directly to R2 (progress-trackable via XHR) without the file ever
// passing through our own server — mirrors the presigned-PUT pattern, replacing the old direct
// POST to Supabase's Storage REST endpoint.
export async function getSignedUploadUrl(
  bucket: string,
  path: string,
  contentType: string,
  expiresInSeconds = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: keyFor(bucket, path),
    ContentType: contentType,
  });
  return getSignedUrl(client(), command, { expiresIn: expiresInSeconds });
}
