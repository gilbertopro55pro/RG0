import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { downloadObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

// Same-origin proxy for a gallery photo, downscaled for client-side face detection. Face
// detection needs raw pixel access via canvas, which a direct <img> pointed at the R2 presigned
// URL can't reliably give without depending on the bucket's CORS config — routing the bytes
// through our own origin sidesteps that entirely. Downscaling here (not full-resolution) also
// keeps the download and the in-browser detection pass fast across a whole gallery.
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
    .select("storage_path")
    .eq("id", photoId)
    .eq("gallery_id", galleryId)
    .maybeSingle<{ storage_path: string }>();
  if (!photo) {
    return NextResponse.json({ error: "התמונה לא נמצאה" }, { status: 404 });
  }

  const buffer = await downloadObjectBuffer("galleries", photo.storage_path);
  if (!buffer) {
    return NextResponse.json({ error: "שגיאה בטעינת התמונה" }, { status: 404 });
  }

  const resized = await sharp(buffer)
    .rotate()
    .resize(900, 900, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return new Response(new Uint8Array(resized), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
