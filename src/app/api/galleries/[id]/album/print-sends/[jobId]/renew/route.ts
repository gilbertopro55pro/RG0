import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { PRINT_LINK_DAYS, daysFromNow } from "@/lib/printHouseLinks";
import type { GalleryAlbumExportJobRow } from "@/lib/types";

export const runtime = "nodejs";

// Renews a print-house link for another week, while the file still exists (no re-render). The
// file's own deletion date moves too, so it outlives the renewed link.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { id: galleryId, jobId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const supabase = createServiceRoleClient();
  const { data: job } = await supabase
    .from("gallery_album_export_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("gallery_id", galleryId)
    .eq("photographer_id", auth.userId)
    .maybeSingle<GalleryAlbumExportJobRow>();
  if (!job || !job.send_to_email || !job.share_token) {
    return NextResponse.json({ error: "השליחה לא נמצאה" }, { status: 404 });
  }
  if (job.status !== "ready" || !job.storage_path) {
    return NextResponse.json({ error: "הקבצים כבר נמחקו, צריך לשלוח מחדש" }, { status: 409 });
  }

  const linkExpiresAt = daysFromNow(PRINT_LINK_DAYS);
  const fileExpiresAt = daysFromNow(PRINT_LINK_DAYS + 1);
  const { error } = await supabase
    .from("gallery_album_export_jobs")
    .update({
      link_expires_at: linkExpiresAt,
      expires_at: new Date(job.expires_at) > new Date(fileExpiresAt) ? job.expires_at : fileExpiresAt,
    })
    .eq("id", job.id);
  if (error) return NextResponse.json({ error: "חידוש הקישור נכשל" }, { status: 500 });
  return NextResponse.json({ linkExpiresAt });
}
