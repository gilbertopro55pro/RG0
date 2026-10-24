import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { getSignedDownloadUrl } from "@/lib/storage";
import { getOrCreatePreviewUrl } from "@/lib/galleryPhotoPreview";
import { photoInScope, resolveGalleryToken } from "@/lib/galleryAccess";
import { ORIGINAL_REDIRECT_CACHE_SECONDS, ORIGINAL_SIGNED_SECONDS } from "@/lib/galleryPhotoUrls";
import type { GalleryPhotoRow } from "@/lib/types";

export const runtime = "nodejs";

// A photo's original file on the client's gallery page: every photo's `url` there points here
// (lib/galleryPhotoUrls.ts) instead of the page presigning thousands of originals on every load.
// Signs only the photo that's actually opened, under the link's own rules, the same ones as the
// page and the download route: the client's own link or a read-only share link within its scope
// (lib/galleryAccess.ts), a published gallery that isn't archived, a photo that wasn't rejected.
// A share link at web quality gets the preview instead: the original never leaves the server.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; photoId: string }> }) {
  const { token, photoId } = await params;
  const supabase = createServiceRoleClient();

  const access = await resolveGalleryToken(supabase, token);
  const gallery = access?.gallery;
  if (!access || !gallery || gallery.archived_at) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }
  if (!gallery.published) {
    // Before publishing, only the photographer previewing the client's own link (like the page).
    const user = access.readOnly ? null : await getSessionUser();
    if (!user || user.id !== gallery.photographer_id) {
      return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
    }
  }

  const { data: photo } = await supabase
    .from("gallery_photos")
    .select("id, gallery_id, folder_id, storage_path, preview_storage_path")
    .eq("id", photoId)
    .eq("gallery_id", gallery.id)
    .neq("culling_status", "rejected")
    .maybeSingle<Pick<GalleryPhotoRow, "id" | "gallery_id" | "folder_id" | "storage_path" | "preview_storage_path">>();
  if (!photo || !photoInScope(photo, access.scope)) {
    return NextResponse.json({ error: "התמונה לא נמצאה" }, { status: 404 });
  }

  if (access.scope?.quality === "web") {
    const preview = await getOrCreatePreviewUrl(supabase, photo);
    if (!preview) return NextResponse.json({ error: "שגיאה בטעינת התמונה" }, { status: 404 });
    return NextResponse.redirect(preview, 302);
  }

  const signed = await getSignedDownloadUrl("galleries", photo.storage_path, ORIGINAL_SIGNED_SECONDS);
  const res = NextResponse.redirect(signed, 302);
  res.headers.set("Cache-Control", `private, max-age=${ORIGINAL_REDIRECT_CACHE_SECONDS}`);
  return res;
}
