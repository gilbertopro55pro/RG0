// The client's corrections on the album, read for the photographer (owner, 2026-11-02): every
// submission grouped into rounds (lib/albumCorrections.ts, correctionRounds), with the times the
// design was sent to the client taken from the event's log. Server-side; the caller's client decides
// what it may read (RLS for the photographer's pages).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectionPage, CorrectionSubmission } from "@/lib/albumCorrections";

// The log line the album tool writes when the photographer sends the design (album/send-to-client).
export const ALBUM_SENT_LOG = "עיצוב האלבום נשלח ללקוח לאישור";

export type CorrectionSubmissionRow = CorrectionSubmission & { seen_at: string | null };

export async function loadAlbumCorrections(
  supabase: SupabaseClient,
  albumId: string,
  eventId: string | null
): Promise<{ submissions: CorrectionSubmissionRow[]; sendTimes: string[] }> {
  const [{ data: rows }, { data: sends }] = await Promise.all([
    supabase
      .from("gallery_album_corrections")
      .select("id, pages, created_at, seen_at")
      .eq("album_id", albumId)
      .order("created_at", { ascending: true })
      .returns<{ id: string; pages: CorrectionPage[]; created_at: string; seen_at: string | null }[]>(),
    eventId
      ? supabase
          .from("event_notifications")
          .select("created_at")
          .eq("event_id", eventId)
          .like("text", `${ALBUM_SENT_LOG}%`)
          .returns<{ created_at: string }[]>()
      : Promise.resolve({ data: [] as { created_at: string }[] }),
  ]);
  return { submissions: rows ?? [], sendTimes: (sends ?? []).map((s) => s.created_at) };
}
