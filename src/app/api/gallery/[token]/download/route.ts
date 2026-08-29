import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSignedDownloadUrl } from "@/lib/storage";
import type { GalleryPhotoRow, GalleryRow } from "@/lib/types";

// Display URLs (fetched once per page load, batched) are generated without a per-file download
// filename — this route generates a short-lived, correctly-named one on demand, only when a
// client actually clicks download, so the page-load batch call stays fast for large galleries.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const photoId = request.nextUrl.searchParams.get("photoId");
  if (!photoId) {
    return NextResponse.json({ error: "photoId חסר" }, { status: 400 });
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

  const { data: photo } = await supabase
    .from("gallery_photos")
    .select("storage_path, original_filename")
    .eq("id", photoId)
    .eq("gallery_id", gallery.id)
    .neq("culling_status", "rejected")
    .maybeSingle<Pick<GalleryPhotoRow, "storage_path" | "original_filename">>();

  if (!photo) {
    return NextResponse.json({ error: "התמונה לא נמצאה" }, { status: 404 });
  }

  const signedUrl = await getSignedDownloadUrl("galleries", photo.storage_path, 300, photo.original_filename);

  if (!signedUrl) {
    return NextResponse.json({ error: "יצירת קישור להורדה נכשלה" }, { status: 500 });
  }

  return NextResponse.json({ url: signedUrl });
}
