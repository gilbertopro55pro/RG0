import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { activeAlbumJob, EXPORT_RUNNING, PRINT_HOUSE_ALREADY_SENDING } from "@/lib/activeAlbumJob";
import { countExportPages, triggerAlbumExportProcessing } from "@/lib/albumExportJobs";
import { PRINT_FILE_DAYS, PRINT_LINK_DAYS, daysFromNow } from "@/lib/printHouseLinks";
import { newPrintToken } from "@/lib/printHouseJob";

export type PrintHouseSendResult = { ok: true; jobId: string } | { ok: false; status: number; error: string; reason: "busy" | "empty" | "failed" };

// Starts a print-house send: a background JPG export job (the album's own size) whose link is
// emailed to the print house once the files are ready (processAlbumExportJob, send_to_email). Shared
// by the album tool's "שליחה לבית דפוס" (api/galleries/[id]/album/send-to-print-house) and the
// client's approval in the gallery (api/gallery/[token]/album/approve), which sends the whole album
// by itself (owner, 2026-10-27). One album job at a time per photographer (migration 0115).
// Must run inside a request (the processing starts in `after`).
export async function enqueuePrintHouseSend(
  // Service role: the approval comes from the client's link, without the photographer's session.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  p: { galleryId: string; albumId: string; photographerId: string; email: string; notes: string; from: number; to: number; origin: string }
): Promise<PrintHouseSendResult> {
  const active = await activeAlbumJob(supabase, p.photographerId);
  if (active) return { ok: false, status: 409, error: active.printHouse ? PRINT_HOUSE_ALREADY_SENDING : EXPORT_RUNNING, reason: "busy" };

  const totalCount = await countExportPages(p.galleryId, p.from, p.to);
  if (totalCount === null) return { ok: false, status: 400, error: "אין עדיין עמודים באלבום", reason: "empty" };

  const { data: job, error } = await supabase
    .from("gallery_album_export_jobs")
    .insert({
      album_id: p.albumId,
      gallery_id: p.galleryId,
      photographer_id: p.photographerId,
      format: "jpg",
      from_page: p.from,
      to_page: p.to,
      total_count: totalCount,
      send_to_email: p.email,
      send_notes: p.notes || null,
      // The link works for a week (so it isn't a permanent, unauthenticated way to redownload a
      // client's paid deliverable). The file is kept longer, so the photographer can renew the
      // link from the send sheet without rendering the album again (printHouseLinks.ts).
      share_token: newPrintToken(),
      link_expires_at: daysFromNow(PRINT_LINK_DAYS),
      expires_at: daysFromNow(PRINT_FILE_DAYS),
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !job) return { ok: false, status: 500, error: error?.message ?? "שגיאה בשליחה לבית הדפוס", reason: "failed" };

  after(() => triggerAlbumExportProcessing(job.id, p.origin));
  return { ok: true, jobId: job.id };
}
