import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { STAGE_LABELS, type StageKey } from "@/lib/stages";
import type { EventRow } from "@/lib/types";

// Only these checkpoints are self-service from the portal — the rest of the pipeline (shoot day,
// culling, editing, final delivery, and photo selection which is driven by the gallery's own
// confirm-selection flow) stays under the photographer's control.
const CLIENT_COMPLETABLE_STAGES: StageKey[] = ["client_song_selection", "video_approval", "album_approval"];

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { stageKey }: { stageKey: string } = await request.json();

  if (!CLIENT_COMPLETABLE_STAGES.includes(stageKey as StageKey)) {
    return NextResponse.json({ error: "שלב לא חוקי" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, client_name")
    .eq("client_access_token", token)
    .maybeSingle<Pick<EventRow, "id" | "client_name">>();

  if (!event) {
    return NextResponse.json({ error: "הקישור שגוי או שפג תוקפו" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from("event_stages")
    .update({ done: true, done_at: now })
    .eq("event_id", event.id)
    .eq("stage_key", stageKey)
    .eq("done", false)
    .select("id")
    .maybeSingle();

  // Only notify on a real transition — re-posting after the stage is already done (e.g. a
  // double-tap) shouldn't spam the photographer with duplicate "client did X" notifications.
  if (updated) {
    await supabase.from("event_notifications").insert({
      event_id: event.id,
      text: `${event.client_name} סימנו כבוצע: ${STAGE_LABELS[stageKey as StageKey]}`,
      is_client_action: true,
    });
  }

  return NextResponse.json({ ok: true });
}
