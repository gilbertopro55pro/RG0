import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { STAGE_LABELS, type StageKey } from "@/lib/stages";
import type { EventRow } from "@/lib/types";
import { markClientDone, stageRole, type ReminderRole } from "@/lib/clientReminders";
import { clipSongLines, parseClipSongs, type ClipSongs } from "@/lib/clipSongs";
import { allowsTwoSongs } from "@/lib/clipSongChoice";
import { changedClipNotes, clipNotesLogText, clipNotesPushPreview, type ClipNotesFields } from "@/lib/clipNotes";
import { sendPushToPhotographer } from "@/lib/push";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { photographerLang } from "@/lib/clientLang";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// Only these checkpoints are self-service from the portal — the rest of the pipeline (shoot day,
// culling, editing, final delivery, and photo selection which is driven by the gallery's own
// confirm-selection flow) stays under the photographer's control. Custom-package stages count
// when they are one of these (named like them, or the album-PDF stage — lib/clientReminders.ts).
const CLIENT_COMPLETABLE_ROLES: ReminderRole[] = ["client_song_selection", "video_approval", "album_approval"];

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // songs: the clip songs written in the portal for the song-selection stage (lib/clipSongs.ts).
  // notes: the clip notes written under them (owner, 2026-10-26, lib/clipNotes.ts), saved with them.
  const { stageKey, songs: songsInput, notes: notesInput }: { stageKey: string; songs?: unknown; notes?: unknown } = await request.json();

  const supabase = createServiceRoleClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, client_name, custom_package_id, event_type, package, is_freelance, event_date, photographer_id, clip_notes, clip_notes_at, photographers(name, email, ui_lang)")
    .eq("client_access_token", token)
    .maybeSingle<
      Pick<EventRow, "id" | "client_name" | "custom_package_id" | "event_type" | "package" | "is_freelance" | "event_date" | "photographer_id"> &
        ClipNotesFields & {
          photographers: { name: string; email: string | null; ui_lang: string | null } | null;
        }
    >();

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

  // The song stage is approved with the songs themselves (owner, 2026-10-13: written in the portal
  // instead of sent on WhatsApp). A request without them (a portal page loaded before the change)
  // still marks the stage, as before.
  let songs: ClipSongs | null = null;
  if (role === "client_song_selection" && songsInput !== undefined) {
    songs = parseClipSongs(songsInput, allowsTwoSongs(event));
    if (!songs) return NextResponse.json({ error: "יש לכתוב שם של שיר או קישור" }, { status: 400 });
    await supabase.from("events").update({ clip_songs: songs }).eq("id", event.id);
  }

  // The notes go out in the songs' own notification below, not a second one (the clip-notes route's).
  // A package with a song stage has a clip, so no other check is needed.
  const notes = songs ? changedClipNotes(event.clip_notes ?? null, notesInput) : null;
  if (notes !== null) {
    await supabase.from("events").update({ clip_notes: notes || null, clip_notes_at: notes ? new Date().toISOString() : null }).eq("id", event.id);
    await supabase.from("event_notifications").insert({
      event_id: event.id,
      text: clipNotesLogText(event.client_name, event.clip_notes ?? null, notes),
      is_client_action: true,
    });
  }
  const notesNow = notes !== null ? notes : (event.clip_notes ?? "");

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
    const lines = clipSongLines(songs);
    await supabase.from("event_notifications").insert({
      event_id: event.id,
      text: lines.length
        ? `${event.client_name} בחרו שירים לקליפ: ${lines.map((l) => `${l.label}: ${l.value}`).join(" · ")}`
        : `${event.client_name} סימנו כבוצע: ${label}`,
      is_client_action: true,
    });
    if (songs) await notifySongsChosen(event, songs, notesNow);
  }

  return NextResponse.json({ ok: true });
}

// The client chose the clip songs (owner, 2026-10-13): a phone notification and an email, in the
// photographer's language, with the songs, so nobody has to dig them out of WhatsApp.
async function notifySongsChosen(
  event: Pick<EventRow, "id" | "client_name" | "event_date" | "photographer_id"> & {
    photographers: { name: string; email: string | null; ui_lang: string | null } | null;
  },
  songs: ClipSongs,
  // The clip notes, when there are any (owner, 2026-10-26: written with the songs).
  notes: string
) {
  const p = event.photographers;
  const lang = photographerLang(p?.ui_lang);
  const t = makeT(messagesFor(lang));
  const lines = clipSongLines(songs).map((l) => `${t(l.label)}: ${l.value}`);
  await sendPushToPhotographer(event.photographer_id, {
    title: t("{name} בחרו שירים לקליפ", { name: event.client_name }),
    body: [...lines, ...(notes ? [`${t("הערות לקליפ")}: ${clipNotesPushPreview(notes)}`] : [])].join("\n"),
    url: `/events/${event.id}`,
    tag: `songs-${event.id}`,
  });
  if (!p?.email) return;
  try {
    await sendEmail({
      to: notificationEmailFor(p.email),
      subject: t("נבחרו שירים לקליפ | {name}", { name: event.client_name }),
      text:
        `${t("שלום {name},", { name: p.name })}\n\n` +
        `${t("{client} בחרו את השירים לקליפ של האירוע ({date}):", { client: event.client_name, date: new Date(event.event_date).toLocaleDateString(dateLocale(lang)) })}\n` +
        `${lines.join("\n")}\n\n` +
        (notes ? `${t("הערות לקליפ")}:\n${notes}\n\n` : "") +
        t("השירים שמורים גם בעמוד האירוע במערכת."),
    });
  } catch (e) {
    console.error("[complete-stage] songs email failed", e);
  }
}
