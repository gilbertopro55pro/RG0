import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { uploadObject } from "@/lib/storage";
import { randomUUID } from "node:crypto";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";

export const runtime = "nodejs";

// Body is the raw image bytes — both the desktop app and the web editor send a plain PUT-style
// request (no multipart parsing needed on either side), with the original filename carried in a
// header since the body itself is opaque binary.
export async function POST(request: Request, { params }: { params: Promise<{ tabId: string }> }) {
  const { tabId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const serviceRole = createServiceRoleClient();
  const { data: tab } = await serviceRole
    .from("custom_ornament_tabs")
    .select("id, photographer_id")
    .eq("id", tabId)
    .maybeSingle<{ id: string; photographer_id: string }>();
  if (!tab || tab.photographer_id !== auth.userId) {
    return NextResponse.json({ error: "הלשונית לא נמצאה" }, { status: 404 });
  }

  // Percent-encoded on the way in (HTTP headers must be ASCII-safe, and Hebrew filenames aren't).
  const rawFilename = request.headers.get("x-filename") ?? "ornament";
  const filename = decodeURIComponent(rawFilename);
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: "הקובץ ריק" }, { status: 400 });
  }

  const id = randomUUID();
  // The DB row keeps the original (decoded) filename for display; the storage key strips
  // anything outside a safe ASCII subset so it's a valid R2 object key regardless of script.
  const safeSegment = filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "ornament";
  const storagePath = `${auth.userId}/${tabId}/${id}-${safeSegment}`;
  await uploadObject("custom-ornaments", storagePath, bytes, contentType);

  const { data: ornament, error } = await serviceRole
    .from("custom_ornaments")
    .insert({ id, tab_id: tabId, photographer_id: auth.userId, storage_path: storagePath, original_filename: filename })
    .select("id, tab_id, original_filename, created_at")
    .single();
  if (error || !ornament) {
    return NextResponse.json({ error: "שגיאה בשמירת העיטור" }, { status: 500 });
  }
  return NextResponse.json({ ornament });
}
