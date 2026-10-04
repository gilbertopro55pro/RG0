import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { STAGE_LABELS, type StageKey } from "@/lib/stages";
import type { EventRow } from "@/lib/types";
import { markClientDone, stageRole, type ReminderRole } from "@/lib/clientReminders";

// Only these checkpoints are self-service from the portal — the rest of the pipeline (shoot day,
// culling, editing, final delivery, and photo selection which is driven by the gallery's own
// confirm-selection flow) stays under the photographer's control. Custom-package stages count
// when they are one of these (named like them, or the album-PDF stage — lib/clientReminders.ts).
const CLIENT_COMPLETABLE_ROLES: ReminderRole[] = ["client_song_selection", "video_approval", "album_approval"];

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { stageKey }: { stageKey: string } = await request.json();

  const supabase = createServiceRoleClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, client_name, custom_package_id")
    .eq("client_access_token", token)
    .maybeSingle<Pick<EventRow, "id" | "client_name" | "custom_package_id">>();

  if (!event) {
    return NextResponse.json({ error: "הקישור שגוי או שפג תוקפו" }, { status: 404 });
  }

  // Resolve the stage: a standard key, or "custom:<id>" of a stage in this event's own package.
  let role: ReminderRole | null = null;
  let label = "";
  let customId: string | null = null;
  if (stageKey?.startsWith("custom:")) {
    customId = stageKey.slice("custom:".length);
    const { data: cs } = await supabase
      .from("custom_package_stages")
      .select("id, name, requires_album_pdf, package_id")
      .eq("id", customId)
      .maybeSingle<{ id: string; name: string; requires_album_pdf: boolean | null; package_id: string }>();
    if (cs && cs.package_id === event.custom_package_id) {
      role = stageRole(null, cs);
      label = cs.name;
    }
  } else {
    role = stageRole(stageKey);
    label = role ? STAGE_LABELS[stageKey as StageKey] : "";
  }
  if (!role || !CLIENT_COMPLETABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "שלב לא חוקי" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const base = supabase.from("event_stages").update({ done: true, done_at: now }).eq("event_id", event.id);
  const { data: updated } = await (customId ? base.eq("custom_stage_id", customId) : base.eq("stage_key", stageKey))
    .eq("done", false)
    .select("id")
    .maybeSingle();

  // The client's own approval / song choice, which also cancels a pending 3-day reminder. A custom
  // album stage is already "done" from the PDF upload, so this is what records the approval.
  const { data: before } = await supabase
    .from("events")
    .select("album_approved_at, songs_chosen_at")
    .eq("id", event.id)
    .maybeSingle<{ album_approved_at: string | null; songs_chosen_at: string | null }>();
  await markClientDone(supabase, event.id, role);
  const newlyRecorded =
    (role === "album_approval" && !before?.album_approved_at) || (role === "client_song_selection" && !before?.songs_chosen_at);

  // Only notify on a real transition — re-posting after the stage is already done (e.g. a
  // double-tap) shouldn't spam the photographer with duplicate "client did X" notifications.
  if (updated || newlyRecorded) {
    await supabase.from("event_notifications").insert({
      event_id: event.id,
      text: `${event.client_name} סימנו כבוצע: ${label}`,
      is_client_action: true,
    });
  }

  return NextResponse.json({ ok: true });
}
