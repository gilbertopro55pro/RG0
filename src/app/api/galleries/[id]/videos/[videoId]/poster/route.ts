import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { uploadPublicPreview } from "@/lib/storage";

export const runtime = "nodejs";

// Saves a still frame of the photographer's own video (captured in their browser,
// lib/videoPoster.ts) as its poster: the cover on a portfolio link's preview card for a tab that
// only has videos (app/p/[slug]/og). Re-encoded here, so only a real image is stored, at a path
// the server picks under the video's gallery (gallery_videos_poster_path_check, migration 0188).

const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const { id: galleryId, videoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  // RLS: only the photographer's own video, in their own gallery.
  const { data: video } = await supabase
    .from("gallery_videos")
    .select("id, poster_path")
    .eq("id", videoId)
    .eq("gallery_id", galleryId)
    .maybeSingle<{ id: string; poster_path: string | null }>();
  if (!video) return NextResponse.json({ error: "הווידאו לא נמצא" }, { status: 404 });

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BYTES) return NextResponse.json({ error: "bad image" }, { status: 400 });
  let poster: Buffer;
  try {
    poster = await sharp(body).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    return NextResponse.json({ error: "bad image" }, { status: 400 });
  }

  // A new name every time: the previews bucket is cached as immutable.
  const path = `previews/${galleryId}/${videoId}-poster-${Date.now().toString(36)}.webp`;
  await uploadPublicPreview(path, poster, "image/webp");
  const { error } = await supabase.from("gallery_videos").update({ poster_path: path }).eq("id", videoId);
  if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
  return NextResponse.json({ posterPath: path });
}
