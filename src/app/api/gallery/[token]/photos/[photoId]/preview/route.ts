import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getOrCreatePreviewUrl } from "@/lib/galleryPhotoPreview";
import { photoInScope, resolveGalleryToken } from "@/lib/galleryAccess";
import type { GalleryPhotoRow } from "@/lib/types";

export const runtime = "nodejs";

// Client-facing equivalent of /api/galleries/[id]/photos/[photoId]/preview — same lazy
// generate-once-then-redirect behavior, gated on the same published/not-archived condition the
// gallery page itself uses (not on allow_downloads, which only gates the actual download routes —
// viewing has always been independent of whether downloads are enabled).
export async function GET(request: Request, { params }: { params: Promise<{ token: string; photoId: string }> }) {
  const { token, photoId } = await params;
  const supabase = createServiceRoleClient();

  // The client's own link, or a read-only share link within its scope (lib/galleryAccess.ts).
  const access = await resolveGalleryToken(supabase, token);
  const gallery = access?.gallery;
  if (!access || !gallery || !gallery.published || gallery.archived_at) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
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

  const url = await getOrCreatePreviewUrl(supabase, photo);
  if (!url) {
    return NextResponse.json({ error: "שגיאה בטעינת התמונה" }, { status: 404 });
  }

  // ?inline=1: the preview's bytes from this site, not a redirect to the CDN. The slideshow video
  // (lib/slideshowVideo.ts) draws the photos on a canvas, and a photo from another site without CORS
  // headers would block the canvas from becoming a video.
  if (new URL(request.url).searchParams.get("inline") === "1") {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) return NextResponse.json({ error: "שגיאה בטעינת התמונה" }, { status: 404 });
    return new Response(new Uint8Array(await res.arrayBuffer()), {
      headers: { "Content-Type": res.headers.get("content-type") ?? "image/webp", "Cache-Control": "private, max-age=3600" },
    });
  }

  return NextResponse.redirect(url);
}
