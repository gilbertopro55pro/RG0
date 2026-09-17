import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

export const runtime = "nodejs";

// Called by the FTP server after it has already streamed a file's bytes straight to R2 itself
// (it holds its own scoped R2 credentials — see photographer-flow-ftp's README) — this route only
// registers the resulting gallery_photos row, mirroring /api/desktop/galleries/[id]/photos'
// registration step. See authenticate/route.ts's comment for why a shared secret, not a user
// session, gates this.
export async function POST(request: Request) {
  const secret = request.headers.get("x-ftp-server-secret");
  if (!secret || secret !== process.env.FTP_SERVER_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const {
    galleryId,
    photographerId,
    path,
    filename,
    fileSizeBytes,
  }: { galleryId?: string; photographerId?: string; path?: string; filename?: string; fileSizeBytes?: number } = await request
    .json()
    .catch(() => ({}));
  if (!galleryId || !photographerId || !path || !filename) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // The shared secret authenticates the FTP server itself, not this specific request's gallery/
  // photographer pairing — without this check, a bug or leak on the FTP server's side could
  // silently cross-link a photo into a gallery it doesn't belong to, since the service-role client
  // bypasses RLS entirely and nothing else here ties galleryId to photographerId.
  const { data: gallery } = await supabase.from("galleries").select("id").eq("id", galleryId).eq("photographer_id", photographerId).maybeSingle();
  if (!gallery) {
    return NextResponse.json({ error: "gallery not found" }, { status: 404 });
  }

  const { count } = await supabase.from("gallery_photos").select("id", { count: "exact", head: true }).eq("gallery_id", galleryId);

  const { data: photo, error } = await supabase
    .from("gallery_photos")
    .insert({
      gallery_id: galleryId,
      photographer_id: photographerId,
      storage_path: path,
      original_filename: filename,
      file_size_bytes: fileSizeBytes ?? 0,
      sort_order: count ?? 0,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !photo) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }
  return NextResponse.json({ id: photo.id });
}
