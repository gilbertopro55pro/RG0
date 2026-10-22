import type { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// The photographer's album job still running, if any (one at a time: the unique index of migration
// 0115), and whether it's a print-house send. Exports can go on in the background since 2026-10-22
// (lib/albumExports.ts), so a print-house send can now be asked for while an export runs, and the
// other way round. An export must not then follow the print-house job as if it were its own (and
// download the print files), and a send must not fail on the unique index with a raw database error.
export type ActiveAlbumJob = { id: string; format: "pdf" | "jpg" | "psd"; galleryId: string; printHouse: boolean };

export async function activeAlbumJob(supabase: ReturnType<typeof createServiceRoleClient>, photographerId: string): Promise<ActiveAlbumJob | null> {
  const { data } = await supabase
    .from("gallery_album_export_jobs")
    .select("id, format, gallery_id, send_to_email")
    .eq("photographer_id", photographerId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; format: "pdf" | "jpg" | "psd"; gallery_id: string; send_to_email: string | null }>();
  return data ? { id: data.id, format: data.format, galleryId: data.gallery_id, printHouse: !!data.send_to_email } : null;
}

// What the routes answer when the running job is in the way.
export const PRINT_HOUSE_SEND_RUNNING = "יש שליחה לבית דפוס שעוד לא הסתיימה. אפשר לייצא כשהיא תסתיים";
export const EXPORT_RUNNING = "יש ייצוא אלבום שעוד לא הסתיים. אפשר לשלוח לבית הדפוס כשהוא יסתיים";
export const PRINT_HOUSE_ALREADY_SENDING = "יש שליחה לבית דפוס שעוד לא הסתיימה";
