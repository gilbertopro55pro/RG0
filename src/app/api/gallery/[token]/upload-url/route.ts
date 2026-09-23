import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSignedUploadUrl } from "@/lib/storage";
import { checkStorageQuota } from "@/lib/storageQuota";
import { ALLOWED_EXTENSIONS, MAX_CLIENT_UPLOAD_BYTES } from "@/lib/imageUpload";
import type { GalleryRow } from "@/lib/types";

const ALLOWED_EXTENSIONS_SET = new Set(ALLOWED_EXTENSIONS);

// Step 1 of 2 for a client-facing upload (see upload-complete/route.ts for step 2): mints a
// short-lived signed PUT URL under the gallery's own storage path, gated on the photographer
// having explicitly turned on allow_client_upload for this gallery.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { fileName, contentType, fileSize }: { fileName: string; contentType?: string; fileSize?: number } = await request.json();

  if (!fileName || typeof fileName !== "string") {
    return NextResponse.json({ error: "שם קובץ חסר" }, { status: 400 });
  }
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (fileName.startsWith(".") || !ext || !ALLOWED_EXTENSIONS_SET.has(ext)) {
    return NextResponse.json({ error: "סוג קובץ לא נתמך" }, { status: 400 });
  }
  // Early rejection only — the declared size is a claim; upload-complete re-checks the real stored
  // size, since a presigned PUT doesn't bind the length that actually gets sent.
  if (typeof fileSize === "number" && fileSize > MAX_CLIENT_UPLOAD_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מדי (מקסימום 30MB)" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .eq("published", true)
    .is("archived_at", null)
    .maybeSingle<GalleryRow>();

  if (!gallery) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }
  if (!gallery.allow_client_upload) {
    return NextResponse.json({ error: "העלאת תמונות אינה מופעלת עבור גלריה זו" }, { status: 403 });
  }

  const quota = await checkStorageQuota(supabase, gallery.photographer_id);
  if (!quota.ok) {
    return NextResponse.json({ error: quota.error }, { status: 403 });
  }

  // Same folder convention as the photographer's own upload (GalleryManageView.tsx) —
  // {photographerId}/{galleryId}/{uuid}-{filename} — so nothing downstream (previews, exports,
  // storage cleanup) needs to special-case where a photo came from.
  const path = `${gallery.photographer_id}/${gallery.id}/${randomUUID()}-${fileName}`;
  const url = await getSignedUploadUrl("galleries", path, contentType || "application/octet-stream");

  return NextResponse.json({ url, path });
}
