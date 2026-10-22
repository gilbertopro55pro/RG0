import { describe, expect, it } from "vitest";
import { CLIP_SONG_MAX, clipSongLines, isWeddingEvent, parseClipSongs } from "@/lib/clipSongs";
import { stageRole } from "@/lib/clientReminders";

// The clip songs: chosen by the client in the portal, or filled on the event page for the client
// (owner, 2026-10-13 and 2026-10-22). Both go through parseClipSongs.
describe("parseClipSongs", () => {
  it("asks a wedding for a calm and an upbeat song", () => {
    expect(parseClipSongs({ calm: " Perfect ", upbeat: "https://youtu.be/x" }, true)).toMatchObject({ calm: "Perfect", upbeat: "https://youtu.be/x" });
    expect(parseClipSongs({ calm: "Perfect", upbeat: "  " }, true)).toBeNull();
  });

  it("takes one song when the wedding prefers one, and from any other event", () => {
    expect(parseClipSongs({ oneSong: true, single: "שיר אחד" }, true)).toMatchObject({ single: "שיר אחד" });
    expect(parseClipSongs({ single: "שיר אחד", calm: "לא נשמר" }, false)).toEqual({ single: "שיר אחד", chosenAt: expect.any(String) });
    expect(parseClipSongs({ single: "" }, false)).toBeNull();
    expect(parseClipSongs(null, false)).toBeNull();
  });

  it("strips control characters and caps the length", () => {
    expect(parseClipSongs({ single: "a\u0000b\nc" }, false)?.single).toBe("a b c");
    expect(parseClipSongs({ single: "x".repeat(CLIP_SONG_MAX + 50) }, false)?.single).toHaveLength(CLIP_SONG_MAX);
  });
});

describe("isWeddingEvent", () => {
  it("knows a wedding in the app's three languages", () => {
    expect(isWeddingEvent("חתונה")).toBe(true);
    expect(isWeddingEvent("Wedding")).toBe(true);
    expect(isWeddingEvent("Свадьба")).toBe(true);
    expect(isWeddingEvent("בר מצווה")).toBe(false);
    expect(isWeddingEvent(null)).toBe(false);
  });
});

describe("clipSongLines", () => {
  it("labels one song, or the calm and upbeat ones, whoever filled them", () => {
    expect(clipSongLines({ single: "A", chosenAt: "2026-10-22T10:00:00Z", by: "photographer" })).toEqual([{ label: "השיר לקליפ", value: "A" }]);
    expect(clipSongLines({ calm: "A", upbeat: "B", chosenAt: "2026-10-22T10:00:00Z" })).toEqual([
      { label: "שיר רגוע", value: "A" },
      { label: "שיר קצבי", value: "B" },
    ]);
    expect(clipSongLines(null)).toEqual([]);
  });
});

// Which stage on the event page gets the song fields: the standard one, or a custom-package stage
// named like it (lib/clientReminders.ts).
describe("the song stage", () => {
  it("is the standard song stage or a custom one with a song in its name", () => {
    expect(stageRole("client_song_selection")).toBe("client_song_selection");
    expect(stageRole(null, { name: "בחירת שירים לקליפ" })).toBe("client_song_selection");
    expect(stageRole(null, { name: "בחירת שיר" })).toBe("client_song_selection");
    expect(stageRole("gallery_upload")).toBeNull();
    expect(stageRole(null, { name: "עריכת וידאו" })).toBeNull();
  });
});
