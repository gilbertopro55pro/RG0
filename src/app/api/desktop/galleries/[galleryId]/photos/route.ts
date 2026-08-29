import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";

export const runtime = "nodejs";

// Step 2 of the desktop app's upload pipeline — called after the desktop app has already PUT the
// file bytes straight to R2 using the presigned URL from .../upload-url. Registers the row so the
// photo shows up in the gallery; its preview image generates lazily the first time anyone actually
// views it (same as every other photo — see /api/galleries/[id]/photos/[photoId]/preview), so
// there's nothing else this route needs to trigger.
export async function POST(request: Request, { params }: { params: Promise<{ galleryId: string }> }) {
  const { galleryId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const serviceRole = createServiceRoleClient();
  const { data: gallery } = await serviceRole
    .from("galleries")
    .select("id, photographer_id")
    .eq("id", galleryId)
    .maybeSingle<{ id: string; photographer_id: string }>();
  if (!gallery || gallery.photographer_id !== auth.userId) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  const { path, filename, fileSizeBytes }: { path?: string; filename?: string; fileSizeBytes?: number } = await request
    .json()
    .catch(() => ({}));
  if (!path || !filename || !path.startsWith(`${auth.userId}/${galleryId}/`)) {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }

  const { count } = await serviceRole
    .from("gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", galleryId);

  const { data: photo, error } = await serviceRole
    .from("gallery_photos")
    .insert({
      gallery_id: galleryId,
      photographer_id: auth.userId,
      storage_path: path,
      original_filename: filename,
      file_size_bytes: fileSizeBytes ?? 0,
      sort_order: count ?? 0,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !photo) {
    return NextResponse.json({ error: error?.message ?? "שגיאה בשמירת התמונה" }, { status: 500 });
  }
  return NextResponse.json({ id: photo.id });
}
