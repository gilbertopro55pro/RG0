import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { removeObjects, removePreviewObjects } from "@/lib/storage";

const VALID_BUCKETS = new Set(["galleries", "album-designs"]);

// Preview objects (see galleryPhotoPreview.ts) live in a wholly separate public bucket under the
// key shape "previews/<galleryId>/<filename>.webp" — never under the caller's own user-id prefix,
// so they can't be checked the same way as `paths` below. That bucket only ever holds compressed,
// non-sensitive thumbnail copies (see storage.ts's previewsClient() comment), so a shape check is
// the appropriate level of validation here, not a full per-gallery ownership lookup.
//
// The filename segment is intentionally NOT pinned to a bare "<photoId>.webp" — every real
// preview in production is actually named "<photoId>-hq.webp" (a naming convention already baked
// into every existing row's preview_storage_path; nothing in the current codebase still writes
// the bare form this used to assume). Requiring an exact bare-UUID match here made this regex
// reject every real preview delete outright — the confirm dialog would close, the request would
// 400 with "בקשה לא חוקית", and because nothing surfaced that error anywhere visible (see the
// GalleryManageView.tsx fix), the whole delete action just looked like it silently did nothing.
// Only the directory segment (which IS the actual ownership/scoping boundary — the gallery id)
// stays strictly validated as a UUID; the filename just can't contain a "/", so no path traversal.
const PREVIEW_PATH_RE = /^previews\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+\.webp$/;

// Same ownership model as upload-url/download-url: every path must sit under the caller's own
// user id prefix, so a photographer can only ever delete their own objects.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const {
    bucket,
    paths = [],
    previewPaths = [],
  }: { bucket: string; paths?: string[]; previewPaths?: string[] } = await request.json();

  if (
    !VALID_BUCKETS.has(bucket) ||
    !Array.isArray(paths) ||
    paths.some((p) => !p.startsWith(`${user.id}/`)) ||
    !Array.isArray(previewPaths) ||
    previewPaths.some((p) => !PREVIEW_PATH_RE.test(p))
  ) {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }

  try {
    await Promise.all([removeObjects(bucket, paths), removePreviewObjects(previewPaths)]);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה במחיקת קבצים מהאחסון" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
