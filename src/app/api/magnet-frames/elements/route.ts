import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireDesignToolsUser } from "@/lib/designTools";
import { uploadObject, getSignedDownloadUrls } from "@/lib/storage";
import type { MagnetFrameCustomElementRow } from "@/lib/types";

const SIGNED_URL_TTL_SECONDS = 3600;
const BUCKET = "magnet-frame-elements";

// Kept across every future design (fetched fresh on each editor load, independent of any one
// magnet_frame_designs row) — matches api/magnet-frames/textures/route.ts's own pattern.
export async function GET() {
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const { data: elements } = await supabase
    .from("magnet_frame_custom_elements")
    .select("*")
    .eq("photographer_id", userId)
    .order("created_at", { ascending: false })
    .returns<MagnetFrameCustomElementRow[]>();

  const paths = (elements ?? []).map((e) => e.storage_path);
  const urlByPath = new Map((await getSignedDownloadUrls(BUCKET, paths, SIGNED_URL_TTL_SECONDS)).map((u) => [u.path, u.signedUrl]));
  return NextResponse.json({ elements: (elements ?? []).map((e) => ({ ...e, url: urlByPath.get(e.storage_path) ?? null })) });
}

// Body is the raw image bytes — same convention as the texture upload and the desktop app's
// custom-ornament upload — the original filename travels in a header since the body itself is
// opaque binary.
export async function POST(request: Request) {
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const rawFilename = request.headers.get("x-filename") ?? "element";
  const filename = decodeURIComponent(rawFilename);
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "הקובץ ריק" }, { status: 400 });

  const id = randomUUID();
  const safeSegment = filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "element";
  const storagePath = `${userId}/${id}-${safeSegment}`;
  await uploadObject(BUCKET, storagePath, bytes, contentType);

  const { data: created, error } = await supabase
    .from("magnet_frame_custom_elements")
    .insert({ id, photographer_id: userId, storage_path: storagePath, original_filename: filename })
    .select()
    .single<MagnetFrameCustomElementRow>();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "שגיאה בהעלאת האלמנט" }, { status: 500 });

  const [signed] = await getSignedDownloadUrls(BUCKET, [storagePath], SIGNED_URL_TTL_SECONDS);
  return NextResponse.json({ element: { ...created, url: signed?.signedUrl ?? null } });
}
