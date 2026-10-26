import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { markClientDone, stageRole } from "@/lib/clientReminders";
import { clipSongLines, parseClipSongs } from "@/lib/clipSongs";
import { allowsTwoSongs } from "@/lib/clipSongChoice";
import type { EventRow } from "@/lib/types";

// The clip songs filled on the event page for the client (ClipSongsStagePanel, owner 2026-10-22):
// the same fields and checks as the portal (api/portal/[token]/complete-stage). Saving also marks
// the song stage done and records the choice (songs_chosen_at, which cancels the 3-day reminder),
// as the client's own choice does. No notification: the photographer did it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { stageKey, songs: input }: { stageKey?: string; songs?: unknown } = await request.json();

  // RLS: only the photographer's (or their team's) own event.
  const { data: event } = await supabase
    .from("events")
    .select("id, event_type, package, is_freelance, custom_package_id")
    .eq("id", eventId)
    .maybeSingle<Pick<EventRow, "id" | "event_type" | "package" | "is_freelance" | "custom_package_id">>();
  if (!event) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });

  const parsed = parseClipSongs(input, allowsTwoSongs(event));
  if (!parsed) return NextResponse.json({ error: "יש לכתוב שם של שיר או קישור" }, { status: 400 });
  const songs = { ...parsed, by: "photographer" as const };

  // The song stage: the standard one, or a custom-package stage named like it.
  let customId: string | null = null;
  if (stageKey?.startsWith("custom:")) {
    customId = stageKey.slice("custom:".length);
    const { data: cs } = await supabase
      .from("custom_package_stages")
      .select("name, requires_album_pdf, package_id")
      .eq("id", customId)
      .maybeSingle<{ name: string; requires_album_pdf: boolean | null; package_id: string }>();
    if (!cs || cs.package_id !== event.custom_package_id || stageRole(null, cs) !== "client_song_selection") {
      return NextResponse.json({ error: "שלב לא חוקי" }, { status: 400 });
    }
  } else if (stageKey && stageRole(stageKey) !== "client_song_selection") {
    return NextResponse.json({ error: "שלב לא חוקי" }, { status: 400 });
  }

  const { error } = await supabase.from("events").update({ clip_songs: songs }).eq("id", event.id);
  if (error) return NextResponse.json({ error: "השמירה נכשלה. נסו שוב" }, { status: 500 });

  let doneAt: string | null = null;
  if (stageKey) {
    const now = new Date().toISOString();
    const base = supabase.from("event_stages").update({ done: true, done_at: now }).eq("event_id", event.id);
    const { data: updated } = await (customId ? base.eq("custom_stage_id", customId) : base.eq("stage_key", stageKey))
      .eq("done", false)
      .select("done_at")
      .maybeSingle<{ done_at: string }>();
    doneAt = updated?.done_at ?? null;
  }
  await markClientDone(supabase, event.id, "client_song_selection");

  await supabase.from("event_notifications").insert({
    event_id: event.id,
    text: `השירים לקליפ נשמרו בשביל הלקוח: ${clipSongLines(songs).map((l) => `${l.label}: ${l.value}`).join(" · ")}`,
  });

  return NextResponse.json({ ok: true, songs, doneAt });
}
