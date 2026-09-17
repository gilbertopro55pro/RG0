import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { uploadObject, getSignedDownloadUrls } from "@/lib/storage";
import type { MagnetFrameCustomTextureRow } from "@/lib/types";

const SIGNED_URL_TTL_SECONDS = 3600;
const BUCKET = "magnet-frame-textures";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return null;
  return { supabase, userId: user.id };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const { data: textures } = await supabase
    .from("magnet_frame_custom_textures")
    .select("*")
    .eq("photographer_id", userId)
    .order("created_at", { ascending: false })
    .returns<MagnetFrameCustomTextureRow[]>();

  const paths = (textures ?? []).map((t) => t.storage_path);
  const urlByPath = new Map((await getSignedDownloadUrls(BUCKET, paths, SIGNED_URL_TTL_SECONDS)).map((u) => [u.path, u.signedUrl]));
  return NextResponse.json({ textures: (textures ?? []).map((t) => ({ ...t, url: urlByPath.get(t.storage_path) ?? null })) });
}

// Body is the raw image bytes — same convention as the desktop app's custom-ornament upload (see
// api/desktop/ornament-tabs/[tabId]/ornaments/route.ts) — the original filename travels in a
// header since the body itself is opaque binary.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const rawFilename = request.headers.get("x-filename") ?? "texture";
  const filename = decodeURIComponent(rawFilename);
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "הקובץ ריק" }, { status: 400 });

  const id = randomUUID();
  const safeSegment = filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "texture";
  const storagePath = `${userId}/${id}-${safeSegment}`;
  await uploadObject(BUCKET, storagePath, bytes, contentType);

  const { data: created, error } = await supabase
    .from("magnet_frame_custom_textures")
    .insert({ id, photographer_id: userId, storage_path: storagePath, original_filename: filename })
    .select()
    .single<MagnetFrameCustomTextureRow>();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "שגיאה בהעלאת הטקסטורה" }, { status: 500 });

  const [signed] = await getSignedDownloadUrls(BUCKET, [storagePath], SIGNED_URL_TTL_SECONDS);
  return NextResponse.json({ texture: { ...created, url: signed?.signedUrl ?? null } });
}
