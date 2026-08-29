import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadObjectBuffer, getSignedDownloadUrl, getPublicPreviewUrl, uploadPublicPreview } from "@/lib/storage";

// A phone decodes a JPEG into an uncompressed bitmap to display it — that cost is driven by PIXEL
// COUNT, not file size, so a heavily-compressed-but-still-2000px preview still forces a ~16MB
// decode on-device. On a memory-constrained phone that's enough to get the tab evicted, which is
// what a "closing the photo restarts the whole app" report actually is. 1200px caps that at ~6MB.
const PREVIEW_MAX_DIMENSION = 1200;
// A single fixed quality, not a multi-pass search — searching for a byte-size target meant up to 8
// sequential full JPEG re-encodes of the same image on a cold serverless function, which is exactly
// what made the very thing this feature exists to fix (slow first view) slow again. One pass only.
// WebP at the same quality number is meaningfully smaller than JPEG for photographic content —
// still a single encode pass, so none of the above risk returns. Safari (desktop and iOS) has
// supported WebP decoding since 2020, well within this app's realistic browser support range.
// This only affects the on-screen gallery preview — full-quality downloads/exports always read the
// untouched original from storage_path, never this file.
const PREVIEW_QUALITY = 50;

// LQIP (low-quality image placeholder): a tiny, heavily-compressed copy small enough to inline as a
// base64 data URI directly in the page's own HTML/JSON — no network request at all, so it's visible
// on the very first paint, before the real preview has even started downloading. ~24px wide keeps
// this at a few hundred bytes to ~1-2KB even for busy photos.
const BLUR_MAX_DIMENSION = 24;
const BLUR_QUALITY = 35;

// Generates and persists a small, fast copy of a gallery photo — called eagerly right after each
// upload finishes (so a photo is basically always ready before anyone clicks it) AND idempotently
// from the viewing routes as a fallback for photos uploaded before this existed, so there's no
// separate backfill step either way. The original at `storage_path` is never touched; every
// download path (single + zip) keeps reading from it at full quality regardless.
export async function getOrCreatePreviewUrl(
  supabase: SupabaseClient,
  photo: { id: string; gallery_id: string; storage_path: string; preview_storage_path: string | null }
): Promise<string | null> {
  if (photo.preview_storage_path) {
    // .webp previews live in the new public CDN bucket (stable, unsigned, cacheable) — anything
    // older is a .jpg that was uploaded to the old private bucket before that existed, and still
    // needs a signed URL to be readable. The extension alone is enough to tell them apart because
    // the JPEG→WebP format switch and the move to the public bucket landed in the same change.
    if (photo.preview_storage_path.endsWith(".webp")) {
      return getPublicPreviewUrl(photo.preview_storage_path);
    }
    return getSignedDownloadUrl("galleries", photo.preview_storage_path, 3600);
  }

  const original = await downloadObjectBuffer("galleries", photo.storage_path);
  if (!original) return null;

  const [previewBuffer, blurBuffer] = await Promise.all([
    sharp(original)
      .rotate()
      .resize(PREVIEW_MAX_DIMENSION, PREVIEW_MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer(),
    sharp(original)
      .rotate()
      .resize(BLUR_MAX_DIMENSION, BLUR_MAX_DIMENSION, { fit: "inside" })
      .jpeg({ quality: BLUR_QUALITY })
      .toBuffer(),
  ]);
  const blurDataUrl = `data:image/jpeg;base64,${blurBuffer.toString("base64")}`;

  // The blur buffer was resized with `fit: "inside"` (no forced dimensions), so its own actual
  // width/height still carry the original photo's aspect ratio — reading it back is essentially
  // free (header parse only) and means the masonry grid style knows the tile's shape immediately
  // from server-sent data, instead of waiting on a client-side onLoad to measure it.
  const blurMeta = await sharp(blurBuffer).metadata();
  const aspectRatio = blurMeta.width && blurMeta.height ? blurMeta.width / blurMeta.height : null;

  const previewPath = `previews/${photo.gallery_id}/${photo.id}.webp`;
  const publicUrl = await uploadPublicPreview(previewPath, previewBuffer, "image/webp");
  await supabase
    .from("gallery_photos")
    .update({ preview_storage_path: previewPath, preview_blur_data_url: blurDataUrl, preview_aspect_ratio: aspectRatio })
    .eq("id", photo.id);

  return publicUrl;
}
