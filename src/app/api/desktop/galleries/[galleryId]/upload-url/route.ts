import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { getSignedUploadUrl } from "@/lib/storage";

export const runtime = "nodejs";

// Step 1 of the desktop app's upload pipeline (mirrors the browser's own two-step upload in
// GalleryManageView.tsx): mint a short-lived presigned PUT URL the desktop app uploads the raw
// file bytes to directly, so R2 credentials never leave this server. Step 2 (POST .../photos)
// registers the row once the PUT actually succeeds.
export async function POST(request: Request, { params }: { params: Promise<{ galleryId: string }> }) {
  const { galleryId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const serviceRole = createServiceRoleClient();
  const { data: gallery } = await serviceRole
    .from("galleries")
    .select("id, photographer_id")
    .eq("id", galleryId)
    .maybeSingle<{ id: string; photographer_id: string }>();
  if (!gallery || gallery.photographer_id !== auth.userId) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  const { filename, contentType }: { filename?: string; contentType?: string } = await request.json().catch(() => ({}));
  if (!filename) {
    return NextResponse.json({ error: "שם קובץ חסר" }, { status: 400 });
  }

  const path = `${auth.userId}/${galleryId}/${randomUUID()}-${filename}`;
  const url = await getSignedUploadUrl("galleries", path, contentType || "application/octet-stream");
  return NextResponse.json({ url, path });
}
