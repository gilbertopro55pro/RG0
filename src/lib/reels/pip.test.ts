import { describe, expect, it } from "vitest";
import { photosPerSegment, templateById, REEL_TEMPLATES, type ReelSettings } from "@/lib/reels/templates";
import { cutBasis, recommendedPhotos, recutReason, reelTimeline, segmentCount } from "@/lib/reels/render";

const settings = (over: Partial<ReelSettings> = {}): ReelSettings => ({
  platform: "ig-reel",
  templateId: "pip",
  length: 15,
  fit: "blur",
  blur: 60,
  music: { source: "none", trackId: "celebration", volume: 0.8, offset: 0 },
  transitions: [],
  seed: 1,
  rhythm: 1,
  fx: null,
  text: { title: "", subtitle: "", ending: "", position: "bottom", show: false, styles: {} as ReelSettings["text"]["styles"] },
  ...over,
});

describe("picture in picture", () => {
  it("has a regular, a two-layer and an on-the-beat template", () => {
    expect(templateById("pip").frame).toBe("pip");
    expect(templateById("pip-duo").frame).toBe("pip");
    expect(templateById("beat-pip").beat).toBeTruthy();
    expect(photosPerSegment(templateById("pip"))).toBe(2);
    expect(photosPerSegment(templateById("beat-pip"))).toBe(2);
    expect(photosPerSegment(templateById("pip-duo"))).toBe(3);
    expect(photosPerSegment(templateById("split"))).toBe(2);
    expect(photosPerSegment(templateById("soft"))).toBe(1);
    expect(REEL_TEMPLATES.filter((t) => t.frame === "pip")).toHaveLength(3);
  });

  it("counts segments, recommended photos and dropped photos by the segment's photos", () => {
    const tpl = templateById("pip");
    expect(segmentCount(9, tpl)).toBe(5);
    expect(recommendedPhotos(15, tpl, settings()) % 2).toBe(0);
    const tl = reelTimeline(40, tpl, settings({ length: 5 }));
    expect(tl.dropped).toBe(40 - tl.segments * 2);
    const duo = templateById("pip-duo");
    expect(segmentCount(9, duo)).toBe(3);
    expect(segmentCount(10, duo)).toBe(4);
    expect(recommendedPhotos(15, duo, settings({ templateId: "pip-duo" })) % 3).toBe(0);
    const tl3 = reelTimeline(40, duo, settings({ templateId: "pip-duo", length: 5 }));
    expect(tl3.dropped).toBe(40 - tl3.segments * 3);
  });
});

describe("re-cut on new music or style", () => {
  const song = { bpm: 118, phase: 0 };
  it("the same template and music keep the times; another song, tempo or start point re-cut them", () => {
    const kept = cutBasis("soft", "library", "/reels/music/celebration.m4a", song.bpm, song.phase);
    expect(recutReason(kept, cutBasis("soft", "library", "/reels/music/celebration.m4a", 118, 0))).toBeNull();
    expect(recutReason(kept, cutBasis("soft", "library", "/reels/music/energy.m4a", 124, 0))).toBe("music");
    expect(recutReason(kept, cutBasis("soft", "library", "/reels/music/celebration.m4a", 118, 0.2))).toBe("music");
    // A song from a link: its tempo is found a moment later, and then it re-cuts again.
    const link = cutBasis("soft", "sync", "file:song.mp4:123", null);
    expect(recutReason(kept, link)).toBe("music");
    expect(recutReason(link, cutBasis("soft", "sync", "file:song.mp4:123", 96, 0.1))).toBe("music");
    expect(recutReason(kept, cutBasis("soft", "none", "/reels/music/celebration.m4a", null))).toBe("music");
  });

  it("another template re-cuts too", () => {
    expect(recutReason(cutBasis("soft", "none", null, null), cutBasis("pip", "none", null, null))).toBe("style");
  });

  it("the timeline ignores times kept for an old basis (the caller passes none), and follows the new beat", () => {
    const tpl = templateById("soft");
    const s = settings({ templateId: "soft", length: 15 });
    const withBeat = reelTimeline(10, tpl, s, null, song);
    const beat = 60 / 118;
    for (const start of withBeat.starts.slice(1)) {
      const units = start / (withBeat.unit ?? beat);
      expect(Math.abs(units - Math.round(units))).toBeLessThan(1e-6);
    }
  });
});
