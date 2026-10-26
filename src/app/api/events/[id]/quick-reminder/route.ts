import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, type StageKey } from "@/lib/stages";
import { stageRole } from "@/lib/clientReminders";
import { QUICK_REMINDER_KINDS, photoSelectionStageOf, quickReminderLogText } from "@/lib/eventQuickActions";

// Records a reminder sent from the event's quick actions (lib/eventQuickActions.ts; the send itself
// is the wa.me link opened on the tap). A line on the event's log, and the home screen's prompt for
// the same reminder, if one is waiting, is closed: this was it.
const PROMPT_KINDS: Record<string, string[]> = {
  payment: ["payment_reminder"],
  songs: ["song_stage_reminder", "song_selection_reminder"],
  photos: [],
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  const kind = QUICK_REMINDER_KINDS.find((k) => k === body?.kind);
  if (!kind) return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });

  const { data: event } = await supabase
    .from("events")
    .select("id, event_stages(stage_key, custom_stage_id, custom_package_stages(name, requires_album_pdf))")
    .eq("id", id)
    .eq("photographer_id", user.id)
    .maybeSingle<{
      id: string;
      event_stages: { stage_key: string | null; custom_stage_id: string | null; custom_package_stages: { name: string; requires_album_pdf: boolean | null } | null }[];
    }>();
  if (!event) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });

  const stages = event.event_stages.map((s) => ({
    key: s.stage_key ?? `custom:${s.custom_stage_id}`,
    label: s.stage_key ? (STAGE_LABELS[s.stage_key as StageKey] ?? s.stage_key) : (s.custom_package_stages?.name ?? ""),
    role: stageRole(s.stage_key, s.custom_package_stages),
  }));
  const stage = kind === "songs" ? stages.find((s) => s.role === "client_song_selection") : kind === "photos" ? photoSelectionStageOf(stages) : null;

  const sentAt = new Date().toISOString();
  const [{ error }] = await Promise.all([
    supabase.from("event_notifications").insert({ event_id: id, text: quickReminderLogText(kind, stage?.label ?? null) }),
    PROMPT_KINDS[kind].length
      ? supabase
          .from("scheduled_messages")
          .update({ status: "sent", sent_at: sentAt })
          .eq("event_id", id)
          .in("kind", PROMPT_KINDS[kind])
          .eq("status", "awaiting_confirmation")
      : Promise.resolve({ error: null }),
  ]);
  if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
  return NextResponse.json({ ok: true, sentAt });
}
