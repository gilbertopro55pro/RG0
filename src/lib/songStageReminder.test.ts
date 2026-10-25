import { describe, expect, it } from "vitest";
import { PACKAGE_FLOWS, STAGE_LABELS } from "@/lib/stages";
import { stageRole } from "@/lib/clientReminders";
import {
  SONG_STAGE_REMINDER_MAX,
  filmReminderBlocks,
  openSongStage,
  roleStages,
  songStageReminderDue,
  type RoleStage,
  type SongStageCandidate,
} from "@/lib/songStageReminder";

// The reminder to ask the client for the clip songs while the song stage is open (owner, 2026-10-25).

// A built-in package's stages, the first `done` of them marked.
const flow = (pkg: keyof typeof PACKAGE_FLOWS, done: number, extraDone: string[] = []): RoleStage[] =>
  PACKAGE_FLOWS[pkg].map((key, i) => ({ key, label: STAGE_LABELS[key], role: stageRole(key), done: i < done || extraDone.includes(key) }));
const indexOf = (pkg: keyof typeof PACKAGE_FLOWS, key: string) => (PACKAGE_FLOWS[pkg] as string[]).indexOf(key);

const event = (o: Partial<SongStageCandidate> = {}): SongStageCandidate => ({
  client_phone: "050-1234567",
  needs_review: false,
  closed_at: null,
  songs_chosen_at: null,
  ...o,
});
const NOW = new Date("2026-10-25T09:00:00.000Z");

describe("openSongStage", () => {
  it("is the song stage once every stage before it is done (it's the next stage)", () => {
    const stages = flow("stills_reel", indexOf("stills_reel", "client_song_selection"));
    expect(openSongStage(stages)?.key).toBe("client_song_selection");
  });

  it("isn't open while an earlier stage is still open and nothing after it is marked", () => {
    // Full package: the gallery is up, the photo selection is still open.
    expect(openSongStage(flow("full", indexOf("full", "client_photo_selection")))).toBeNull();
    expect(openSongStage(flow("stills_reel", 2))).toBeNull();
  });

  it("is open when it was left open behind a later stage that was marked", () => {
    const stages = flow("full", indexOf("full", "client_photo_selection"), ["video_editing"]);
    expect(openSongStage(stages)?.key).toBe("client_song_selection");
  });

  it("closes once the songs stage, the video approval or the final delivery is done", () => {
    const i = indexOf("full", "client_song_selection");
    expect(openSongStage(flow("full", i + 1))).toBeNull();
    expect(openSongStage(flow("full", i, ["video_approval"]))).toBeNull();
    expect(openSongStage(flow("stills_reel", 2, ["final_delivery"]))).toBeNull();
  });

  it("needs a song stage: none in a stills package or a freelance film without a clip", () => {
    expect(openSongStage(flow("stills", 6))).toBeNull();
    expect(openSongStage(flow("freelance_video_film", 1))).toBeNull();
  });

  it("works for a freelance clip right after the shoot day", () => {
    expect(openSongStage(flow("freelance_video_film_clip", 1))?.key).toBe("client_song_selection");
    expect(openSongStage(flow("freelance_video_film_clip", 0))).toBeNull();
  });
});

describe("roleStages", () => {
  it("orders the rows and reads a custom stage's role from its name", () => {
    const custom = new Map([
      ["c1", { id: "c1", name: "בחירת שירים לקליפ" }],
      ["c2", { id: "c2", name: "אישור קליפ" }],
    ]);
    const stages = roleStages(
      [
        { stage_key: null, custom_stage_id: "c2", done: false, stage_order: 3 },
        { stage_key: "shoot_day", custom_stage_id: null, done: true, stage_order: 1 },
        { stage_key: null, custom_stage_id: "c1", done: false, stage_order: 2 },
        { stage_key: "event_closing", custom_stage_id: null, done: true, stage_order: 0 },
        { stage_key: null, custom_stage_id: "gone", done: false, stage_order: 4 },
      ],
      custom,
      STAGE_LABELS
    );
    expect(stages.map((s) => s.key)).toEqual(["event_closing", "shoot_day", "custom:c1", "custom:c2"]);
    expect(stages.map((s) => s.role)).toEqual([null, null, "client_song_selection", "video_approval"]);
    expect(stages[2].label).toBe("בחירת שירים לקליפ");
    expect(openSongStage(stages)?.key).toBe("custom:c1");
  });
});

describe("songStageReminderDue", () => {
  const open = flow("stills_reel", indexOf("stills_reel", "client_song_selection"));

  it("is due when the stage is open and nothing was sent yet", () => {
    expect(songStageReminderDue(event(), open, [], false, NOW)).toBe(true);
  });

  it("skips an event with no phone, an unverified import, a closed event or songs already chosen", () => {
    expect(songStageReminderDue(event({ client_phone: null }), open, [], false, NOW)).toBe(false);
    expect(songStageReminderDue(event({ client_phone: " " }), open, [], false, NOW)).toBe(false);
    expect(songStageReminderDue(event({ needs_review: true }), open, [], false, NOW)).toBe(false);
    expect(songStageReminderDue(event({ closed_at: "2026-10-20T10:00:00Z" }), open, [], false, NOW)).toBe(false);
    expect(songStageReminderDue(event({ songs_chosen_at: "2026-10-24T10:00:00Z" }), open, [], false, NOW)).toBe(false);
  });

  it("skips a stage that isn't open, or a client asked lately", () => {
    expect(songStageReminderDue(event(), flow("stills_reel", 2), [], false, NOW)).toBe(false);
    expect(songStageReminderDue(event(), open, [], true, NOW)).toBe(false);
  });

  it("comes again 3 days after the last one (the daily run a little earlier still counts)", () => {
    expect(songStageReminderDue(event(), open, ["2026-10-23T09:00:00.000Z"], false, NOW)).toBe(false);
    expect(songStageReminderDue(event(), open, ["2026-10-22T09:05:00.000Z"], false, NOW)).toBe(true);
    expect(songStageReminderDue(event(), open, ["2026-10-22T09:05:00.000Z", "2026-10-19T09:00:00.000Z"], false, NOW)).toBe(true);
  });

  it("stops after 3 reminders per event", () => {
    const three = ["2026-10-10T09:00:00Z", "2026-10-13T09:00:00Z", "2026-10-16T09:00:00Z"];
    expect(three).toHaveLength(SONG_STAGE_REMINDER_MAX);
    expect(songStageReminderDue(event(), open, three, false, NOW)).toBe(false);
    expect(songStageReminderDue(event(), open, three.slice(0, 2), false, NOW)).toBe(true);
  });
});

describe("filmReminderBlocks", () => {
  it("blocks while the 3-day reminder after the film's message is waiting, or went out lately", () => {
    expect(filmReminderBlocks([{ status: "pending", send_at: "2026-10-27T09:00:00Z" }], NOW)).toBe(true);
    expect(filmReminderBlocks([{ status: "awaiting_confirmation", send_at: "2026-10-20T09:00:00Z" }], NOW)).toBe(true);
    expect(filmReminderBlocks([{ status: "sent", send_at: "2026-10-24T09:00:00Z" }], NOW)).toBe(true);
  });

  it("doesn't block once it's older than 3 days, or with none", () => {
    expect(filmReminderBlocks([{ status: "sent", send_at: "2026-10-20T09:00:00Z" }], NOW)).toBe(false);
    expect(filmReminderBlocks([{ status: "canceled", send_at: "2026-10-21T09:00:00Z" }], NOW)).toBe(false);
    expect(filmReminderBlocks([], NOW)).toBe(false);
  });
});
