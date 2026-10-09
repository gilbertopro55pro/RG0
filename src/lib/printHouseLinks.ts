// Print-house links (migration 0140). The print-house email links to /print/<share_token> on our
// own site instead of straight to the file, so we can record the download (and notify the
// photographer) and renew an expired link without re-rendering the album.
import type { SupabaseClient } from "@supabase/supabase-js";

// How long a print-house link works, and how long the file itself is kept (the gap is what makes
// "renew the link" possible without rendering the album again).
export const PRINT_LINK_DAYS = 7;
export const PRINT_FILE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
export const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

export const printLinkUrl = (token: string) => `https://myframeflow.com/print/${token}`;

export const formatPrintDate = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const formatPrintDay = (iso: string) =>
  new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric" });

// "עמודים 3–7 מתוך 20 (לא כל האלבום)" for a print job that sends only some of the album's pages
// (the photographer picks them, owner 2026-10-09), or null for the whole album. Shown in the
// print-house email and on its download page, so the print house doesn't take part of an album for
// all of it. Pages count the cover as page 1 when the album has one, like the export range.
export async function printPagesLine(
  supabase: SupabaseClient,
  albumId: string,
  fromPage: number,
  pageCount: number
): Promise<string | null> {
  const [{ data: album }, { count }] = await Promise.all([
    supabase.from("gallery_albums").select("cover_photo_id").eq("id", albumId).maybeSingle<{ cover_photo_id: string | null }>(),
    supabase.from("gallery_album_spreads").select("id", { count: "exact", head: true }).eq("album_id", albumId),
  ]);
  const whole = (album?.cover_photo_id ? 1 : 0) + (count ?? 0);
  if (whole <= 0 || pageCount <= 0 || (fromPage <= 1 && pageCount >= whole)) return null;
  const to = Math.min(whole, fromPage + pageCount - 1);
  return `עמודים ${fromPage}–${to} מתוך ${whole} (לא כל האלבום)`;
}
