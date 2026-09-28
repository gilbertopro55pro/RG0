import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import type { GalleryAlbumExportJobRow } from "@/lib/types";

export const runtime = "nodejs";

export type PrintSend = {
  id: string;
  email: string;
  label: string | null;
  status: GalleryAlbumExportJobRow["status"];
  createdAt: string;
  fromPage: number;
  toPage: number;
  notes: string | null;
  linkUrl: string | null;
  linkExpiresAt: string | null;
  fileAvailable: boolean;
  downloadCount: number;
  firstDownloadedAt: string | null;
  lastDownloadedAt: string | null;
};

// The gallery's recent print-house sends, with their download status (migration 0140).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: galleryId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const supabase = createServiceRoleClient();
  const { data: jobs } = await supabase
    .from("gallery_album_export_jobs")
    .select("*")
    .eq("gallery_id", galleryId)
    .eq("photographer_id", auth.userId)
    .not("send_to_email", "is", null)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<GalleryAlbumExportJobRow[]>();
  const { data: houses } = await supabase
    .from("print_house_emails")
    .select("email, label")
    .eq("photographer_id", auth.userId)
    .returns<{ email: string; label: string | null }[]>();
  const labelOf = new Map((houses ?? []).map((h) => [h.email, h.label?.trim() || null]));

  const sends: PrintSend[] = (jobs ?? []).map((j) => ({
    id: j.id,
    email: j.send_to_email!,
    label: labelOf.get(j.send_to_email!) ?? null,
    status: j.status,
    createdAt: j.created_at,
    fromPage: j.from_page,
    toPage: j.to_page,
    notes: j.send_notes,
    linkUrl: j.share_token ? `/print/${j.share_token}` : null,
    linkExpiresAt: j.share_token ? j.link_expires_at : j.expires_at,
    fileAvailable: !!j.storage_path,
    downloadCount: j.download_count,
    firstDownloadedAt: j.first_downloaded_at,
    lastDownloadedAt: j.last_downloaded_at,
  }));
  return NextResponse.json({ sends });
}
