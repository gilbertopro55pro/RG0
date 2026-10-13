import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { downloadObjectBuffer } from "@/lib/storage";
import { resizeForWebQuality } from "@/lib/zipJobs";
import { photoInScope, resolveGalleryToken } from "@/lib/galleryAccess";
import type { GalleryPhotoRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// One photo at web quality (the same resize as a web-quality zip), for a read-only share link that
// was shared at web quality: the original never leaves the server.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const photoId = request.nextUrl.searchParams.get("photoId");
  if (!photoId) return NextResponse.json({ error: "photoId חסר" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const access = await resolveGalleryToken(supabase, token);
  const gallery = access && access.gallery.published && !access.gallery.archived_at ? access.gallery : null;
  if (!access || !gallery) return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  if (!gallery.allow_downloads) return NextResponse.json({ error: "הורדת תמונות מכובה עבור גלריה זו" }, { status: 403 });

  const { data: photo } = await supabase
    .from("gallery_photos")
    .select("id, folder_id, storage_path, original_filename")
    .eq("id", photoId)
    .eq("gallery_id", gallery.id)
    .neq("culling_status", "rejected")
    .maybeSingle<Pick<GalleryPhotoRow, "id" | "folder_id" | "storage_path" | "original_filename">>();
  if (!photo || !photoInScope(photo, access.scope)) return NextResponse.json({ error: "התמונה לא נמצאה" }, { status: 404 });

  const original = await downloadObjectBuffer("galleries", photo.storage_path);
  if (!original) return NextResponse.json({ error: "התמונה לא נמצאה" }, { status: 404 });
  let file: Buffer;
  try {
    file = await resizeForWebQuality(original);
  } catch {
    return NextResponse.json({ error: "הכנת התמונה להורדה נכשלה" }, { status: 500 });
  }
  const name = (photo.original_filename || "photo").replace(/\.[^.]+$/, "") + ".jpg";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(file.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
