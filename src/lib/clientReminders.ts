import type { SupabaseClient } from "@supabase/supabase-js";
import { STAGE_LABELS, type StageKey } from "@/lib/stages";
import { ALBUM_REMINDER_DAYS_DEFAULT, isAlbumReminderDays } from "@/lib/albumApproval";

// Reminders to the photographer to nudge a client (owner's request, 2026-10-04):
// - album: 3 days after the "album design ready" message, if the client hasn't approved it.
// - songs: 3 days after the "full film ready" message (video approval stage), if the client
//   hasn't picked the clip songs (a calm one and an upbeat one).
// Sending the stage message schedules a scheduled_messages row; the send-scheduled-messages cron
// checks again when it's due and, only if still needed, flags it for the photographer (push +
// dashboard prompt with a ready WhatsApp message). Packages without these stages never schedule.
// The album reminder's days (1–14, 3 by default) and its on/off switch are the photographer's
// (photographers.album_approval_reminder_days / album_approval_reminder, owner 2026-10-27); the
// album tool's send to the client schedules it too (scheduleAlbumApprovalReminder).

export const CLIENT_REMINDER_DAYS = 3;

export type ReminderRole = "album_approval" | "video_approval" | "client_song_selection";
export type ClientReminderKind = "album_approval_reminder" | "song_selection_reminder";

// Which of the three stages a stage is: the standard keys, or a custom-package stage by its name
// (the owner's custom stages are named like the standard ones) or by its album-PDF flag.
export function stageRole(stageKey: string | null, custom?: { name: string; requires_album_pdf?: boolean | null } | null): ReminderRole | null {
  if (stageKey === "album_approval" || stageKey === "video_approval" || stageKey === "client_song_selection") return stageKey;
  if (!custom) return null;
  const name = custom.name.replace(/\s+/g, " ").trim();
  const is = (k: StageKey) => name === STAGE_LABELS[k];
  if (is("album_approval") || custom.requires_album_pdf || (/אישור/.test(name) && /אלבום/.test(name))) return "album_approval";
  if (is("client_song_selection") || /שיר/.test(name)) return "client_song_selection";
  if (is("video_approval") || (/אישור/.test(name) && /(וידאו|וידיאו|סרט|קליפ)/.test(name))) return "video_approval";
  return null;
}

type StageRow = { stage_key: string | null; custom_stage_id: string | null; done: boolean };
type CustomStage = { id: string; name: string; requires_album_pdf: boolean | null };

// The event's stages with their roles resolved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function eventStageRoles(supabase: SupabaseClient<any>, eventId: string) {
  const { data: stages } = await supabase
    .from("event_stages")
    .select("stage_key, custom_stage_id, done")
    .eq("event_id", eventId)
    .returns<StageRow[]>();
  const customIds = (stages ?? []).map((s) => s.custom_stage_id).filter((x): x is string => !!x);
  const { data: customs } = customIds.length
    ? await supabase.from("custom_package_stages").select("id, name, requires_album_pdf").in("id", customIds).returns<CustomStage[]>()
    : { data: [] as CustomStage[] };
  const byId = new Map((customs ?? []).map((c) => [c.id, c]));
  return (stages ?? []).map((s) => ({
    key: s.stage_key ?? `custom:${s.custom_stage_id}`,
    done: s.done,
    role: stageRole(s.stage_key, s.custom_stage_id ? byId.get(s.custom_stage_id) : null),
  }));
}

// Called when the photographer sends a stage message to the client. Replaces any earlier reminder
// of the same kind for the event, so a re-sent message restarts the 3 days.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function scheduleReminderForStage(supabase: SupabaseClient<any>, eventId: string, stageKey: string): Promise<ClientReminderKind | null> {
  const roles = await eventStageRoles(supabase, eventId);
  const sent = roles.find((r) => r.key === stageKey);
  if (!sent?.role) return null;

  const { data: event } = await supabase
    .from("events")
    .select("album_approved_at, songs_chosen_at")
    .eq("id", eventId)
    .maybeSingle<{ album_approved_at: string | null; songs_chosen_at: string | null }>();
  if (!event) return null;

  if (sent.role === "album_approval") {
    if (event.album_approved_at) return null;
    return (await scheduleAlbumApprovalReminder(supabase, eventId)) === null ? null : "album_approval_reminder";
  }
  if (sent.role === "video_approval") {
    const song = roles.find((r) => r.role === "client_song_selection");
    if (song && !song.done && !event.songs_chosen_at) {
      await replaceReminder(supabase, eventId, "song_selection_reminder", CLIENT_REMINDER_DAYS);
      return "song_selection_reminder";
    }
  }
  return null;
}

// Replaces any waiting reminder of this kind for the event with one due in `days` (null: only
// cancels the waiting one).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function replaceReminder(supabase: SupabaseClient<any>, eventId: string, kind: ClientReminderKind, days: number | null) {
  await supabase
    .from("scheduled_messages")
    .update({ status: "canceled" })
    .eq("event_id", eventId)
    .eq("kind", kind)
    .in("status", ["pending", "awaiting_confirmation"]);
  if (days === null) return;
  await supabase.from("scheduled_messages").insert({
    event_id: eventId,
    kind,
    status: "pending",
    send_at: new Date(Date.now() + days * 86_400_000).toISOString(),
  });
}

// The photographer's album reminder: on/off and after how many days.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function albumReminderSetting(supabase: SupabaseClient<any>, photographerId: string): Promise<{ enabled: boolean; days: number }> {
  const { data } = await supabase
    .from("photographers")
    .select("album_approval_reminder, album_approval_reminder_days")
    .eq("id", photographerId)
    .maybeSingle<{ album_approval_reminder: boolean | null; album_approval_reminder_days: number | null }>();
  return {
    enabled: data?.album_approval_reminder !== false,
    days: isAlbumReminderDays(data?.album_approval_reminder_days) ? data.album_approval_reminder_days : ALBUM_REMINDER_DAYS_DEFAULT,
  };
}

// The album design was sent to the client (the stage message on the event page, or the album
// tool's send): a reminder after the photographer's days, replacing a waiting one, so a send again
// restarts the count. Switched off: any waiting one is canceled. Returns the days, or null.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function scheduleAlbumApprovalReminder(supabase: SupabaseClient<any>, eventId: string): Promise<number | null> {
  const { data: event } = await supabase.from("events").select("photographer_id").eq("id", eventId).maybeSingle<{ photographer_id: string }>();
  if (!event) return null;
  const setting = await albumReminderSetting(supabase, event.photographer_id);
  await replaceReminder(supabase, eventId, "album_approval_reminder", setting.enabled ? setting.days : null);
  return setting.enabled ? setting.days : null;
}

// Whether the reminder is still needed (checked when it's due, and again when the photographer
// taps "send"): false once the client approved the album / picked the songs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reminderStillNeeded(supabase: SupabaseClient<any>, eventId: string, kind: ClientReminderKind): Promise<boolean> {
  const { data: event } = await supabase
    .from("events")
    .select("album_approved_at, songs_chosen_at")
    .eq("id", eventId)
    .maybeSingle<{ album_approved_at: string | null; songs_chosen_at: string | null }>();
  if (!event) return false;
  const roles = await eventStageRoles(supabase, eventId);
  if (kind === "album_approval_reminder") {
    if (event.album_approved_at) return false;
    // The standard checkpoint is only marked done by the client (portal) or by hand; a custom
    // album stage is marked done when the PDF is uploaded, so it doesn't count as an approval.
    const standard = roles.find((r) => r.key === "album_approval");
    if (standard?.done) return false;
    // Approved in the gallery's album proofing.
    const { data: approved } = await supabase
      .from("galleries")
      .select("id, gallery_albums!inner(status)")
      .eq("event_id", eventId)
      .eq("gallery_albums.status", "approved")
      .limit(1);
    return !(approved && approved.length > 0);
  }
  if (event.songs_chosen_at) return false;
  const song = roles.find((r) => r.role === "client_song_selection");
  return !!song && !song.done;
}

// Marks the client's approval / song choice on the event (portal and gallery approval routes).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function markClientDone(supabase: SupabaseClient<any>, eventId: string, role: ReminderRole) {
  const now = new Date().toISOString();
  if (role === "album_approval") await supabase.from("events").update({ album_approved_at: now }).eq("id", eventId).is("album_approved_at", null);
  if (role === "client_song_selection") await supabase.from("events").update({ songs_chosen_at: now }).eq("id", eventId).is("songs_chosen_at", null);
  // The song choice also closes the reminder of an open song stage (lib/songStageReminder.ts).
  const kinds: string[] =
    role === "album_approval" ? ["album_approval_reminder"] : role === "client_song_selection" ? ["song_selection_reminder", "song_stage_reminder"] : [];
  if (kinds.length) {
    await supabase
      .from("scheduled_messages")
      .update({ status: "canceled" })
      .eq("event_id", eventId)
      .in("kind", kinds)
      .in("status", ["pending", "awaiting_confirmation"]);
  }
}
