import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { downloadObjectBuffer, removeObjects } from "@/lib/storage";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ ornamentId: string }> }) {
  const { ornamentId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const serviceRole = createServiceRoleClient();
  const { data: ornament } = await serviceRole
    .from("custom_ornaments")
    .select("storage_path, photographer_id")
    .eq("id", ornamentId)
    .maybeSingle<{ storage_path: string; photographer_id: string }>();
  if (!ornament || ornament.photographer_id !== auth.userId) {
    return NextResponse.json({ error: "העיטור לא נמצא" }, { status: 404 });
  }

  const buffer = await downloadObjectBuffer("custom-ornaments", ornament.storage_path);
  if (!buffer) {
    return NextResponse.json({ error: "שגיאה בטעינת העיטור" }, { status: 404 });
  }

  // A real image type (from the stored file's extension), so the editor can point <img> / CSS
  // masks straight at this route instead of downloading every ornament up front as a blob.
  const ext = ornament.storage_path.split(".").pop()?.toLowerCase() ?? "";
  const contentType =
    ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "svg" ? "image/svg+xml" : ext === "gif" ? "image/gif" : "application/octet-stream";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ ornamentId: string }> }) {
  const { ornamentId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const serviceRole = createServiceRoleClient();
  const { data: ornament } = await serviceRole
    .from("custom_ornaments")
    .select("storage_path, photographer_id")
    .eq("id", ornamentId)
    .maybeSingle<{ storage_path: string; photographer_id: string }>();
  if (!ornament || ornament.photographer_id !== auth.userId) {
    return NextResponse.json({ error: "העיטור לא נמצא" }, { status: 404 });
  }

  await serviceRole.from("custom_ornaments").delete().eq("id", ornamentId);
  await removeObjects("custom-ornaments", [ornament.storage_path]);

  return NextResponse.json({ ok: true });
}
