import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { getSignedDownloadUrl } from "@/lib/storage";
import { ORIGINAL_REDIRECT_CACHE_SECONDS, ORIGINAL_SIGNED_SECONDS } from "@/lib/galleryPhotoUrls";
import type { GalleryPhotoRow } from "@/lib/types";

export const runtime = "nodejs";

// A photo's original file on the photographer's gallery screen: every photo's `url` points here
// (lib/galleryPhotoUrls.ts) instead of the page presigning thousands of originals on every load.
// Signs only the photo that's actually opened, and the browser keeps the redirect for a while, so
// opening it again doesn't come back here. The read goes through the caller's own RLS, like the
// /image and /preview routes next to it, and must match both the gallery and the photo.
// ?link=1 answers with the signed URL itself instead of the redirect: the photo's "שיתוף", which
// sends a link that has to work for someone without the photographer's session.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { id: galleryId, photoId } = await params;
  // A GET from an <img>: the JWT checked locally (lib/supabase/sessionUser.ts), no Auth round trip.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("gallery_photos")
    .select("storage_path")
    .eq("id", photoId)
    .eq("gallery_id", galleryId)
    .maybeSingle<Pick<GalleryPhotoRow, "storage_path">>();
  if (!photo) {
    return NextResponse.json({ error: "התמונה לא נמצאה" }, { status: 404 });
  }

  const signed = await getSignedDownloadUrl("galleries", photo.storage_path, ORIGINAL_SIGNED_SECONDS);
  if (new URL(request.url).searchParams.get("link") === "1") {
    return NextResponse.json({ url: signed }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const res = NextResponse.redirect(signed, 302);
  res.headers.set("Cache-Control", `private, max-age=${ORIGINAL_REDIRECT_CACHE_SECONDS}`);
  return res;
}
