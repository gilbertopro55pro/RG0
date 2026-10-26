import { describe, expect, it } from "vitest";
import { allowsTwoSongs } from "@/lib/clipSongChoice";

// One clip song or two (owner, 2026-10-26: weddings and freelance jobs with a clip).
describe("allowsTwoSongs", () => {
  const ev = (event_type: string | null, pkg: string | null, is_freelance = false) =>
    ({ event_type, package: pkg, is_freelance }) as Parameters<typeof allowsTwoSongs>[0];

  it("a wedding", () => {
    expect(allowsTwoSongs(ev("חתונה", "full"))).toBe(true);
    expect(allowsTwoSongs(ev("Wedding", "stills_video"))).toBe(true);
  });

  it("a freelance job, by its package or the freelance mark", () => {
    expect(allowsTwoSongs(ev(null, "freelance_video_film_clip"))).toBe(true);
    expect(allowsTwoSongs(ev("בר מצווה", "freelance_video_film_clip_reels"))).toBe(true);
    expect(allowsTwoSongs(ev("בר מצווה", "full", true))).toBe(true);
  });

  it("any other event has one song", () => {
    expect(allowsTwoSongs(ev("בר מצווה", "full"))).toBe(false);
    expect(allowsTwoSongs(ev("חינה", "full"))).toBe(false);
    expect(allowsTwoSongs(ev(null, null))).toBe(false);
  });
});
