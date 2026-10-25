import { stageRole, type ReminderRole } from "@/lib/clientReminders";

// A reminder to the photographer to ask the client for the clip songs (owner, 2026-10-25, "עדכון
// שקוף"): while the song-selection stage is the current stage, or was left open behind a later
// one, the daily send-scheduled-messages cron adds an awaiting_confirmation row of kind
// song_stage_reminder and a phone notification, and the home screen opens the song stage's message
// from the client messages settings, with the portal link, where the client writes the songs. Every
// 3 days at most, 3 times per event, until the songs are chosen or the stage is marked. Switched off
// per photographer in Settings › Automation (photographers.song_stage_reminder).

export const SONG_STAGE_REMINDER_EVERY_DAYS = 3;
export const SONG_STAGE_REMINDER_MAX = 3;

export type RoleStage = { key: string; label: string; role: ReminderRole | null; done: boolean };

type StageRow = { stage_key: string | null; custom_stage_id: string | null; done: boolean; stage_order: number };
type CustomStage = { id: string; name: string; requires_album_pdf?: boolean | null };

// The event's stage rows in order, with what each one is (a custom stage by its name).
export function roleStages(rows: readonly StageRow[], customById: ReadonlyMap<string, CustomStage>, labels: Record<string, string>): RoleStage[] {
  return [...rows]
    .sort((a, b) => a.stage_order - b.stage_order)
    .flatMap((r) => {
      if (r.stage_key) return [{ key: r.stage_key, label: labels[r.stage_key] ?? r.stage_key, role: stageRole(r.stage_key), done: r.done }];
      const cs = customById.get(r.custom_stage_id ?? "");
      return cs ? [{ key: `custom:${cs.id}`, label: cs.name, role: stageRole(null, cs), done: r.done }] : [];
    });
}

// The song-selection stage when the client should be asked for the songs: it's the current stage
// (every stage before it is done), or it was left open behind a later stage that was marked. Not
// once the video approval or the final delivery is done: the clip is past the songs by then.
export function openSongStage(stages: readonly RoleStage[]): RoleStage | null {
  const i = stages.findIndex((s) => s.role === "client_song_selection");
  if (i < 0 || stages[i].done) return null;
  if (stages.some((s) => s.done && (s.role === "video_approval" || s.key === "final_delivery"))) return null;
  const current = stages.slice(0, i).every((s) => s.done);
  const leftOpen = stages.slice(i + 1).some((s) => s.done);
  return current || leftOpen ? stages[i] : null;
}

export type SongStageCandidate = {
  client_phone: string | null;
  needs_review: boolean | null;
  closed_at: string | null;
  songs_chosen_at: string | null;
};

const DAY_MS = 86_400_000;
// The cron runs once a day: a run a few minutes earlier than the one 3 days before still counts.
const SLACK_MS = 6 * 3_600_000;

// Whether the event gets a reminder now. `earlier`: the send_at of the event's earlier reminders
// of this kind, any status (a cancel counts too, so it isn't asked again the next day).
// `recentlyAsked`: the photographer sent the client the song stage's message by hand lately, or the
// 3-day reminder after the full film's message is waiting or went out lately (lib/clientReminders.ts),
// so the client isn't asked twice.
export function songStageReminderDue(
  event: SongStageCandidate,
  stages: readonly RoleStage[],
  earlier: readonly string[],
  recentlyAsked: boolean,
  now: Date = new Date()
): boolean {
  if (!event.client_phone?.trim() || event.needs_review || event.closed_at || event.songs_chosen_at) return false;
  if (!openSongStage(stages) || recentlyAsked) return false;
  if (earlier.length >= SONG_STAGE_REMINDER_MAX) return false;
  const last = Math.max(0, ...earlier.map((iso) => Date.parse(iso)).filter((ms) => !Number.isNaN(ms)));
  return now.getTime() - last >= SONG_STAGE_REMINDER_EVERY_DAYS * DAY_MS - SLACK_MS;
}

// The 3-day reminder after the full film's message (song_selection_reminder), as a reason not to
// ask again: waiting to be sent or answered, or sent or skipped in the last 3 days.
export function filmReminderBlocks(rows: readonly { status: string; send_at: string }[], now: Date = new Date()): boolean {
  return rows.some(
    (r) =>
      r.status === "pending" ||
      r.status === "awaiting_confirmation" ||
      now.getTime() - Date.parse(r.send_at) < SONG_STAGE_REMINDER_EVERY_DAYS * DAY_MS - SLACK_MS
  );
}
