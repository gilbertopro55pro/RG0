// Lead retention (owner's decision, 2026-09-29; migration 0141). An open lead that was not converted
// to an event and had no activity (any change, tracked by a DB trigger on leads.last_activity_at)
// for LEAD_IDLE_DAYS moves to the archive on the next day; it stays there LEAD_ARCHIVE_DAYS (it can
// still be converted to an event or deleted for good) and is then deleted permanently. Runs daily
// from the gallery-lifecycle cron.
import type { SupabaseClient } from "@supabase/supabase-js";

export const LEAD_IDLE_DAYS = 13;
export const LEAD_ARCHIVE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days left before an archived lead is deleted for good (0 = deleted at the next run).
export function daysUntilPurge(archivedAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(archivedAt) + LEAD_ARCHIVE_DAYS * DAY_MS - now) / DAY_MS));
}

export async function runLeadRetention(supabase: SupabaseClient): Promise<{ archived: number; purged: number }> {
  const now = Date.now();
  const { data: archived, error: archiveError } = await supabase
    .from("leads")
    .update({ archived_at: new Date(now).toISOString() })
    .is("archived_at", null)
    .is("converted_event_id", null)
    .neq("status", "won")
    .lt("last_activity_at", new Date(now - LEAD_IDLE_DAYS * DAY_MS).toISOString())
    .select("id");
  if (archiveError) throw archiveError;

  const { data: expired, error: expiredError } = await supabase
    .from("leads")
    .select("id, bot_conversation_id")
    .not("archived_at", "is", null)
    .is("converted_event_id", null)
    .lt("archived_at", new Date(now - LEAD_ARCHIVE_DAYS * DAY_MS).toISOString())
    .returns<{ id: string; bot_conversation_id: string | null }[]>();
  if (expiredError) throw expiredError;
  let purged = 0;
  if (expired?.length) {
    const ids = expired.map((l) => l.id);
    const convs = expired.map((l) => l.bot_conversation_id).filter((c): c is string => !!c);
    // The assistant conversation holds the client's details too; it goes with the lead.
    if (convs.length) await supabase.from("bot_conversations").delete().in("id", convs);
    const { data: deleted, error: deleteError } = await supabase.from("leads").delete().in("id", ids).select("id");
    if (deleteError) throw deleteError;
    purged = deleted?.length ?? 0;
  }
  return { archived: archived?.length ?? 0, purged };
}
