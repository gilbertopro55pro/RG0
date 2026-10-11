// Loads a print-house job by its public share token for the /print page and its download route.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GalleryAlbumExportJobRow } from "@/lib/types";

export type PrintJobView = {
  job: GalleryAlbumExportJobRow;
  albumTitle: string;
  galleryTitle: string;
  eventId: string | null;
  photographerName: string | null;
  // Why the files can't be downloaded right now, or null when they can.
  blocked: null | "preparing" | "failed" | "expired";
};

// A new print-house link token: 12 characters, so the link in the email stays short (72 random
// bits, and the link expires anyway). Tokens from before 2026-10-07 are 32 characters.
export const newPrintToken = () => randomBytes(9).toString("base64url");

// Whether a token could be one we issued, checked before touching the database. It must accept every
// length newPrintToken has ever made: when the tokens were shortened to 12 characters, this still
// required 20, and every link sent from 2026-10-07 to 2026-10-11 showed "הקישור לא נמצא".
const isPrintToken = (token: string) => /^[A-Za-z0-9_-]{12,128}$/.test(token);

export async function loadPrintJob(supabase: SupabaseClient, token: string): Promise<PrintJobView | null> {
  if (!token || !isPrintToken(token)) return null;
  const { data: job } = await supabase
    .from("gallery_album_export_jobs")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<GalleryAlbumExportJobRow>();
  if (!job || !job.send_to_email) return null;

  const [{ data: album }, { data: gallery }, { data: photographer }] = await Promise.all([
    supabase.from("gallery_albums").select("title").eq("id", job.album_id).maybeSingle<{ title: string }>(),
    supabase.from("galleries").select("title, event_id").eq("id", job.gallery_id).maybeSingle<{ title: string; event_id: string | null }>(),
    supabase.from("photographers").select("name").eq("id", job.photographer_id).maybeSingle<{ name: string | null }>(),
  ]);

  const now = Date.now();
  let blocked: PrintJobView["blocked"] = null;
  if (job.status === "failed" || job.status === "cancelled") blocked = "failed";
  else if (job.status !== "ready") blocked = "preparing";
  else if (!job.storage_path || (job.link_expires_at && new Date(job.link_expires_at).getTime() < now)) blocked = "expired";

  return {
    job,
    albumTitle: album?.title ?? "אלבום",
    galleryTitle: gallery?.title ?? "",
    eventId: gallery?.event_id ?? null,
    photographerName: photographer?.name ?? null,
    blocked,
  };
}
