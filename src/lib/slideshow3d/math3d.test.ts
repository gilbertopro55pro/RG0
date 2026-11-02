import { describe, expect, it } from "vitest";
import {
  about,
  applyAffine,
  cameraFor,
  chain,
  facesCamera,
  planeQuad,
  planeStrips,
  quadWidth,
  rotateX,
  rotateY,
  rotateZ,
  translate,
  IDENTITY,
} from "@/lib/slideshow3d/math3d";

const DEG = Math.PI / 180;
const cam = cameraFor(1920, 1080);
const plane = (T = IDENTITY) => ({ T, w: 1200, h: 800 });

// The 3D of the slideshow on a 2D canvas: photos as flat rectangles in perspective, drawn as strips.
describe("3D slideshow geometry", () => {
  it("composes transforms right to left, like CSS", () => {
    const p = applyAffine(chain(translate(10, 0, 0), rotateZ(90 * DEG)), [1, 0, 0]);
    expect(p[0]).toBeCloseTo(10, 9);
    expect(p[1]).toBeCloseTo(1, 9);
    // A door on its hinge: the hinge stays where it is.
    const hinge = applyAffine(about([-600, 0, 0], rotateY(70 * DEG)), [-600, 0, 0]);
    expect(hinge).toEqual([-600, 0, 0]);
    // A positive turn about the vertical axis brings the right edge toward the viewer (z < 0).
    expect(applyAffine(rotateY(30 * DEG), [100, 0, 0])[2]).toBeLessThan(0);
    // A positive tilt brings the top edge toward the viewer.
    expect(applyAffine(rotateX(30 * DEG), [0, -100, 0])[2]).toBeLessThan(0);
  });

  it("draws a flat photo facing the viewer as one exact rectangle", () => {
    const s = planeStrips(cam, plane())!;
    expect(s.sliced).toBe(false);
    expect(s.strips).toHaveLength(1);
    const [st] = s.strips;
    expect(st.o).toEqual([360, 140]);
    expect(st.ax[0]).toBeCloseTo(1200, 9);
    expect(st.ax[1]).toBeCloseTo(0, 9);
    expect(st.ay[0]).toBeCloseTo(0, 9);
    expect(st.ay[1]).toBeCloseTo(800, 9);
    expect([st.from, st.to]).toEqual([0, 1]);
  });

  it("draws nothing edge-on or from behind", () => {
    expect(planeStrips(cam, plane(rotateY(90 * DEG)))).toBeNull();
    expect(planeStrips(cam, plane(rotateX(90 * DEG)))).toBeNull();
    expect(facesCamera(cam, plane(rotateY(120 * DEG)))).toBe(false);
    expect(facesCamera(cam, plane(rotateY(-60 * DEG)))).toBe(true);
    expect(planeStrips(cam, { T: IDENTITY, w: 0, h: 100 })).toBeNull();
  });

  it("shrinks steadily as it turns, the near side bigger than the far side", () => {
    let last = Infinity;
    for (let a = 0; a < 90; a += 5) {
      const q = planeQuad(cam, plane(rotateY(a * DEG)));
      const w = quadWidth(q);
      expect(w).toBeLessThan(last);
      last = w;
      if (a > 0) {
        // Right edge comes closer: taller than the left.
        expect(q.br[1] - q.tr[1]).toBeGreaterThan(q.bl[1] - q.tl[1]);
      }
    }
    expect(last).toBeLessThan(300);
  });

  it("slices a turned photo into strips across the turn, narrower toward the far side", () => {
    const s = planeStrips(cam, plane(rotateY(50 * DEG)), { maxErr: 1, maxStrips: 96 })!;
    expect(s.sliced).toBe(true);
    expect(s.axis).toBe("u");
    expect(s.strips.length).toBeGreaterThan(10);
    expect(s.strips.length).toBeLessThanOrEqual(96);
    // The strips cover the photo in order, end to end.
    expect(s.strips[0].from).toBe(0);
    expect(s.strips[s.strips.length - 1].to).toBe(1);
    for (let i = 1; i < s.strips.length; i++) expect(s.strips[i].from).toBeCloseTo(s.strips[i - 1].to, 12);
    // Far (left) strips are drawn narrower than near (right) ones, and widen steadily.
    const widths = s.strips.map((st) => Math.hypot(st.ax[0], st.ax[1]));
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    // Each strip starts exactly where the plane's top edge is.
    const q = s.quad;
    expect(s.strips[0].o[0]).toBeCloseTo(q.tl[0], 6);
    expect(s.strips[0].o[1]).toBeCloseTo(q.tl[1], 6);
    // A tilt is sliced the other way.
    expect(planeStrips(cam, plane(rotateX(50 * DEG)))!.axis).toBe("v");
  });

  it("uses more strips for a stronger turn, and fewer for the screen than the video", () => {
    const n = (deg: number, maxErr: number) => planeStrips(cam, plane(rotateY(deg * DEG)), { maxErr, maxStrips: 10000 })!.strips.length;
    expect(n(3, 0.6)).toBeLessThan(n(12, 0.6));
    expect(n(12, 1.25)).toBeLessThan(n(12, 0.6));
    // Never more than asked for.
    expect(planeStrips(cam, plane(rotateY(60 * DEG)), { maxErr: 0.1, maxStrips: 64 })!.strips.length).toBe(64);
  });
});
