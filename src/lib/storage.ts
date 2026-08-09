import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
