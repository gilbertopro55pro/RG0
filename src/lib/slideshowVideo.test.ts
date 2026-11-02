import { describe, expect, it } from "vitest";
import {
  ENTRANCE_SECONDS,
  SLIDE_EFFECTS,
  SLIDE_SECONDS,
  containRect,
  cubicBezier,
  easeOut,
  entranceEase,
  randomEffects,
  slideAt,
  slidePose,
  slideshowFileName,
  slideshowSeconds,
  slideshowVideoSize,
} from "@/lib/slideshowVideo";

// The slideshow as a video (owner, 2026-11-02): the same slides as on the screen.
describe("slideshow video", () => {
  it("shows each photo for 3 seconds, the last one to the end", () => {
    expect(slideshowSeconds(4)).toBe(12);
    expect(slideAt(0, 4)).toEqual({ index: 0, local: 0 });
    expect(slideAt(2.9, 4).index).toBe(0);
    expect(slideAt(3, 4)).toEqual({ index: 1, local: 0 });
    expect(slideAt(11.99, 4).index).toBe(3);
    // Past the end stays on the last photo.
    expect(slideAt(20, 4).index).toBe(3);
    expect(slideAt(5, 0)).toEqual({ index: 0, local: 0 });
  });

  it("eases like the CSS of the slideshow", () => {
    for (const f of [easeOut, entranceEase, cubicBezier(0.25, 0.1, 0.25, 1)]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      expect(f(0.5)).toBeGreaterThan(0.5);
    }
    // cubic-bezier(0.22, 1, 0.36, 1) is almost there halfway.
    expect(entranceEase(0.5)).toBeGreaterThan(0.9);
    // Linear stays linear.
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 4);
  });

  it("starts and ends each effect where the CSS animation does", () => {
    const end = (e: (typeof SLIDE_EFFECTS)[number]) => slidePose(e, e.startsWith("kenburns") ? SLIDE_SECONDS : ENTRANCE_SECONDS);
    expect(slidePose("kenburns-in", 0).scale).toBe(1);
    expect(end("kenburns-in").scale).toBeCloseTo(1.32, 5);
    expect(slidePose("kenburns-out", 0).scale).toBeCloseTo(1.32, 5);
    expect(end("kenburns-out").scale).toBeCloseTo(1, 5);
    expect(slidePose("fade-punch", 0)).toMatchObject({ opacity: 0, scale: 0.88 });
    expect(slidePose("slide-left", 0)).toMatchObject({ dx: 0.22, opacity: 0 });
    expect(slidePose("slide-right", 0).dx).toBeCloseTo(-0.22, 5);
    expect(slidePose("slide-up", 0).dy).toBeCloseTo(0.18, 5);
    expect(slidePose("slide-down", 0).dy).toBeCloseTo(-0.18, 5);
    expect(slidePose("rotate-in", 0)).toMatchObject({ opacity: 0, rotate: -9, scale: 0.9 });
    expect(slidePose("circle-reveal", 0).reveal).toBe(0);
    expect(end("circle-reveal").reveal).toBeCloseTo(75, 5);
    // Every effect ends on the photo whole, still and visible.
    for (const e of SLIDE_EFFECTS) {
      const p = slidePose(e, SLIDE_SECONDS);
      expect(p.opacity).toBeCloseTo(1, 5);
      expect(p.dx).toBeCloseTo(0, 5);
      expect(p.dy).toBeCloseTo(0, 5);
      expect(p.rotate).toBeCloseTo(0, 5);
    }
  });

  it("fits the photo whole in the frame, centered", () => {
    expect(containRect(3000, 2000, 1920, 1080)).toEqual({ x: 150, y: 0, w: 1620, h: 1080 });
    expect(containRect(2000, 3000, 1920, 1080)).toEqual({ x: 600, y: 0, w: 720, h: 1080 });
    expect(containRect(0, 100, 1920, 1080).w).toBe(0);
  });

  it("is Full HD on a computer and 720p on a phone", () => {
    expect(slideshowVideoSize(false)).toMatchObject({ width: 1920, height: 1080 });
    expect(slideshowVideoSize(true)).toMatchObject({ width: 1280, height: 720 });
  });

  it("names the file after the gallery, without characters a file can't have", () => {
    expect(slideshowFileName("יעל ואיתי, חתונה", "מצגת", "mp4")).toBe("יעל ואיתי, חתונה - מצגת.mp4");
    expect(slideshowFileName('a/b:c*?"<>|', "Slideshow", "webm")).toBe("a b c - Slideshow.webm");
    expect(slideshowFileName("", "מצגת", "mp4")).toBe("מצגת.mp4");
    expect(slideshowFileName(null, "מצגת", "mp4")).toBe("מצגת.mp4");
  });

  it("picks one of the effects for every photo", () => {
    const list = randomEffects(5, () => 0.99);
    expect(list).toHaveLength(5);
    expect(list.every((e) => e === SLIDE_EFFECTS[SLIDE_EFFECTS.length - 1])).toBe(true);
  });
});
