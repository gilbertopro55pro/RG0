import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";

// Mints a short-lived signed playback URL on demand for the photographer's own management view —
// mirrors the photo preview route's pattern, RLS-scoped so a photographer can only ever request
// their own video's URL.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const { id: galleryId, videoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: video } = await supabase
    .from("gallery_videos")
    .select("storage_path")
    .eq("id", videoId)
    .eq("gallery_id", galleryId)
    .maybeSingle<{ storage_path: string }>();
  if (!video) {
    return NextResponse.json({ error: "הווידאו לא נמצא" }, { status: 404 });
  }

  const url = await getSignedDownloadUrl("galleries", video.storage_path, 60 * 30);
  return NextResponse.json({ url });
}
