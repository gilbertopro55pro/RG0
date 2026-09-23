import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getObjectSize, removeObjects } from "@/lib/storage";
import { MAX_CLIENT_UPLOAD_BYTES } from "@/lib/imageUpload";
import type { GalleryRow } from "@/lib/types";

// Step 2 of 2 for a client-facing upload (see upload-url/route.ts for step 1): the file is
// already in storage at `path` by the time this is called (the browser PUT it there directly
// using the signed URL from step 1) — this just records the gallery_photos row, the same way the
// photographer's own upload does right after its own PUT succeeds.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const {
    path,
    originalFilename,
    folderId,
  }: { path: string; originalFilename: string; folderId?: string | null } = await request.json();

  if (!path || !originalFilename) {
    return NextResponse.json({ error: "נתונים חסרים" }, { status: 400 });
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
  if (!gallery.allow_client_upload) {
    return NextResponse.json({ error: "העלאת תמונות אינה מופעלת עבור גלריה זו" }, { status: 403 });
  }
  // The path must actually be one this same request would have minted in step 1 — a client can't
  // point this at storage belonging to a different photographer/gallery.
  if (!path.startsWith(`${gallery.photographer_id}/${gallery.id}/`)) {
    return NextResponse.json({ error: "נתיב לא חוקי" }, { status: 400 });
  }

  // Everything the browser sent is a claim — check what actually landed in R2. The size cap in
  // upload-url only sees the size the browser declares (a presigned PUT doesn't bind a length),
  // and file_size_bytes feeds the storage quota, so both use the real stored size from here on.
  // A path that's already recorded (e.g. another photo's storage_path) is refused too, or a
  // duplicate row could later take that photo's file down with it when deleted.
  const { count: existingForPath } = await supabase
    .from("gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("storage_path", path);
  if (existingForPath) {
    return NextResponse.json({ error: "נתיב לא חוקי" }, { status: 400 });
  }
  const storedBytes = await getObjectSize("galleries", path);
  if (storedBytes === null) {
    return NextResponse.json({ error: "הקובץ לא הגיע לאחסון — נסו להעלות שוב" }, { status: 400 });
  }
  if (storedBytes > MAX_CLIENT_UPLOAD_BYTES) {
    await removeObjects("galleries", [path]).catch((e) => console.error("[upload-complete] failed to remove oversized upload", e));
    return NextResponse.json({ error: "הקובץ גדול מדי (מקסימום 30MB)" }, { status: 400 });
  }

  // A folder id must actually belong to this gallery — same trust boundary as the storage path
  // check above, since a client could otherwise point an upload at another gallery's folder.
  let validFolderId: string | null = null;
  if (folderId) {
    const { data: folder } = await supabase.from("gallery_folders").select("id").eq("id", folderId).eq("gallery_id", gallery.id).maybeSingle();
    validFolderId = folder?.id ?? null;
  }

  const { count } = await supabase
    .from("gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", gallery.id);

  const { data: photo, error } = await supabase
    .from("gallery_photos")
    .insert({
      gallery_id: gallery.id,
      photographer_id: gallery.photographer_id,
      storage_path: path,
      original_filename: originalFilename,
      file_size_bytes: storedBytes,
      sort_order: count ?? 0,
      folder_id: validFolderId,
    })
    .select("*")
    .single();

  if (error || !photo) {
    return NextResponse.json({ error: error?.message ?? "שגיאה בשמירת התמונה" }, { status: 500 });
  }

  // Standalone galleries (no event) have no event_notifications feed to write to — same guard the
  // favorite route uses.
  if (gallery.event_id) {
    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: `הלקוח/ה העלו תמונה חדשה לגלריה: ${originalFilename}`,
      is_client_action: true,
    });
  }

  return NextResponse.json({ ok: true, photo });
}
