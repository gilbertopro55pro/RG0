import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePreviewUrl } from "@/lib/galleryPhotoPreview";
import type { GalleryPhotoRow } from "@/lib/types";

export const runtime = "nodejs";

// Redirects to a fast, small preview of a gallery photo for on-screen viewing (grid/lightbox) —
// generated lazily on first request and cached in storage from then on (see galleryPhotoPreview.ts).
// Downloads never hit this route; they keep reading the original at full quality via storage_path.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { id: galleryId, photoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: photo } = await supabase
    .from("gallery_photos")
    .select("id, gallery_id, storage_path, preview_storage_path")
    .eq("id", photoId)
    .eq("gallery_id", galleryId)
    .maybeSingle<Pick<GalleryPhotoRow, "id" | "gallery_id" | "storage_path" | "preview_storage_path">>();
  if (!photo) {
    return NextResponse.json({ error: "התמונה לא נמצאה" }, { status: 404 });
  }

  const url = await getOrCreatePreviewUrl(supabase, photo);
  if (!url) {
    return NextResponse.json({ error: "שגיאה בטעינת התמונה" }, { status: 404 });
  }

  return NextResponse.redirect(url);
}
