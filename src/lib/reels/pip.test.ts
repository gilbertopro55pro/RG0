import { describe, expect, it } from "vitest";
import { pipInsetRect } from "@/lib/reels/scene";
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
  it("has a regular and an on-the-beat template, two photos a segment", () => {
    expect(templateById("pip").frame).toBe("pip");
    expect(templateById("beat-pip").beat).toBeTruthy();
    expect(photosPerSegment(templateById("pip"))).toBe(2);
    expect(photosPerSegment(templateById("split"))).toBe(2);
    expect(photosPerSegment(templateById("soft"))).toBe(1);
    expect(REEL_TEMPLATES.filter((t) => t.frame === "pip")).toHaveLength(2);
  });

  it("counts segments, recommended photos and dropped photos in pairs", () => {
    const tpl = templateById("pip");
    expect(segmentCount(9, tpl)).toBe(5);
    expect(recommendedPhotos(15, tpl, settings()) % 2).toBe(0);
    const tl = reelTimeline(40, tpl, settings({ length: 5 }));
    expect(tl.dropped).toBe(40 - tl.segments * 2);
  });

  it("keeps the small photo inside the screen, away from the very top and bottom, in every corner and moment", () => {
    for (const [W, H] of [
      [1080, 1920],
      [1080, 1350],
      [1080, 1080],
    ]) {
      for (const aspect of [0.5, 0.75, 1, 1.5, 2.2]) {
        for (let k = 0; k < 8; k++) {
          for (const p of [0, 0.25, 0.5, 0.75, 1]) {
            const r = pipInsetRect(W, H, aspect, k, p);
            // The rotated frame's bounding box, with its white border.
            const border = Math.min(W, H) * 0.012;
            const w = (r.w + 2 * border) * r.scale;
            const h = (r.h + 2 * border) * r.scale;
            const bw = Math.abs(w * Math.cos(r.turn)) + Math.abs(h * Math.sin(r.turn));
            const bh = Math.abs(w * Math.sin(r.turn)) + Math.abs(h * Math.cos(r.turn));
            expect(r.cx - bw / 2).toBeGreaterThan(0);
            expect(r.cx + bw / 2).toBeLessThan(W);
            expect(r.cy - bh / 2).toBeGreaterThan(H * 0.05);
            expect(r.cy + bh / 2).toBeLessThan(H * 0.95);
            // Small: under 40% of the screen.
            expect((r.w * r.h) / (W * H)).toBeLessThan(0.4);
          }
        }
      }
    }
  });

  it("moves: the small photo drifts and turns through its segment, and takes another corner in the next", () => {
    const a = pipInsetRect(1080, 1920, 1.5, 0, 0);
    const b = pipInsetRect(1080, 1920, 1.5, 0, 1);
    expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThan(30);
    expect(a.turn).not.toBeCloseTo(b.turn, 3);
    const next = pipInsetRect(1080, 1920, 1.5, 1, 0);
    expect(Math.sign(next.cx - 540)).not.toBe(Math.sign(a.cx - 540));
    expect(Math.sign(next.cy - 960)).not.toBe(Math.sign(a.cy - 960));
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
