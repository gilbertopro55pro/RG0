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
    const res = await client().send(
      new GetObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: keyFor(bucket, path) })
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
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

export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await client().send(
    new DeleteObjectsCommand({
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Delete: { Objects: paths.map((path) => ({ Key: keyFor(bucket, path) })) },
    })
  );
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
