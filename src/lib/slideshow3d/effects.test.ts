import { describe, expect, it } from "vitest";
import { cameraFor, facesCamera, planeQuad, quadArea } from "@/lib/slideshow3d/math3d";
import { REST_SHADOW, type FxImage, type PlaneOp } from "@/lib/slideshow3d/effects";
import { FIT, driftWeight, frameScene, restSize, type FxFrame } from "@/lib/slideshow3d/render";
import { SHOW_SLIDE_SECONDS, TRANSITIONS, makeDrift, seededRandom, type TransitionId } from "@/lib/slideshow3d/plan";

const cam = cameraFor(1920, 1080);
const imgA: FxImage = { el: {} as CanvasImageSource, w: 1800, h: 1200, bg: null };
const imgB: FxImage = { el: {} as CanvasImageSource, w: 1200, h: 1800, bg: null };
const random = seededRandom(11);
const driftA = makeDrift(random);
const driftB = makeDrift(random);

function frame(id: TransitionId, dir: 1 | -1, progress: number, reverse = false): FxFrame {
  return {
    incoming: { img: imgB, age: progress * 1.2, drift: driftB },
    outgoing: { img: imgA, age: SHOW_SLIDE_SECONDS + progress * 1.2, drift: driftA },
    transition: { id, dir, seed: 77 },
    progress,
    reverse,
  };
}

// The planes a viewer actually sees: not faded out, facing the camera, not a sliver.
const visible = (ops: PlaneOp[]) =>
  ops.filter((o): o is Extract<PlaneOp, { kind: "plane" }> => o.kind === "plane" && o.alpha > 0.01 && facesCamera(cam, o.g) && quadArea(planeQuad(cam, o.g)) > 1);

// The 3D transitions (owner, 2026-11-02: "אפקטים מטורפים ומגוונים").
describe("3D slideshow effects", () => {
  it("fits the photo whole, with room around it for the background", () => {
    const land = restSize({ w: 3000, h: 2000 }, 1920, 1080);
    expect(land.w).toBeCloseTo(1620 * FIT, 9);
    expect(land.h).toBeCloseTo(1080 * FIT, 9);
    expect(restSize({ w: 2000, h: 3000 }, 1920, 1080).h).toBeCloseTo(1080 * FIT, 9);
    expect(driftWeight(0)).toBe(1);
    expect(driftWeight(1)).toBeCloseTo(1, 9);
    expect(driftWeight(0.5)).toBeCloseTo(0, 9);
  });

  for (const id of TRANSITIONS) {
    for (const dir of [1, -1] as const) {
      it(`${id} (${dir}): starts on the old photo only, ends on the new one only, shows both on the way`, () => {
        const start = visible(frameScene(cam, frame(id, dir, 1e-6)).ops);
        expect(start.length).toBeGreaterThan(0);
        expect(start.every((o) => o.img === imgA)).toBe(true);
        const end = visible(frameScene(cam, frame(id, dir, 1 - 1e-6)).ops);
        expect(end.length).toBeGreaterThan(0);
        expect(end.every((o) => o.img === imgB)).toBe(true);
        let both = false;
        let sawA = false;
        let sawB = false;
        for (let p = 0.05; p < 1; p += 0.05) {
          const ops = frameScene(cam, frame(id, dir, p)).ops;
          for (const o of ops) {
            for (const v of [...o.g.T.m, ...o.g.T.t]) expect(Number.isFinite(v)).toBe(true);
          }
          const seen = visible(ops);
          const a = seen.some((o) => o.img === imgA);
          const b = seen.some((o) => o.img === imgB);
          sawA ||= a;
          sawB ||= b;
          if (a && b) both = true;
        }
        expect(sawA && sawB).toBe(true);
        // A card turning over has one face toward the viewer at a time; every other effect shows
        // both photos together at some point.
        if (!id.startsWith("flip")) expect(both).toBe(true);
      });

      it(`${id} (${dir}): backward, starts on the photo that was on and ends on the one gone back to`, () => {
        // Going back from the incoming photo (on) to the outgoing one is the frame with the roles
        // swapped: incoming = the photo gone back to.
        const back = (progress: number): FxFrame => ({
          incoming: { img: imgA, age: progress * 1.2, drift: driftA },
          outgoing: { img: imgB, age: 2 + progress * 1.2, drift: driftB },
          transition: { id, dir, seed: 77 },
          progress,
          reverse: true,
        });
        expect(visible(frameScene(cam, back(1e-6)).ops).every((o) => o.img === imgB)).toBe(true);
        expect(visible(frameScene(cam, back(1 - 1e-6)).ops).every((o) => o.img === imgA)).toBe(true);
      });
    }
  }

  it("holds a photo whole, in its drift, with its shadow", () => {
    const scene = frameScene(cam, { incoming: { img: imgA, age: 1, drift: driftA }, outgoing: null, transition: null, progress: 1 });
    expect(scene.ops).toHaveLength(1);
    const op = scene.ops[0];
    expect(op.kind).toBe("plane");
    if (op.kind === "plane") {
      expect(op.shadow).toBe(REST_SHADOW);
      expect(op.src).toEqual([0, 0, 1800, 1200]);
      expect(op.alpha).toBe(1);
    }
    expect(scene.bgFrom).toBe(imgA);
  });

  it("opens with the first photo rising out of the dark", () => {
    const at = (p: number) => frameScene(cam, { incoming: { img: imgA, age: p * 1.2, drift: driftA }, outgoing: null, transition: null, progress: p });
    expect(at(0).fade).toBe(0);
    expect(visible(at(0).ops)).toHaveLength(0);
    expect(at(0.999).fade).toBeCloseTo(1, 2);
    const late = at(0.999).ops[0];
    expect(late.kind === "plane" && late.alpha).toBeCloseTo(1, 3);
  });

  it("crossfades the blurred background from the old photo to the new", () => {
    const s = frameScene(cam, frame("cube", 1, 0.5));
    expect(s.bgFrom).toBe(imgA);
    expect(s.bgTo).toBe(imgB);
    expect(s.mix).toBeCloseTo(0.5, 6);
    // Backward the roles swap, so the background still goes from the photo that was on.
    const r = frameScene(cam, frame("cube", 1, 0.1, true));
    expect(r.bgFrom).toBe(imgB);
    expect(r.bgTo).toBe(imgA);
    expect(r.mix).toBeGreaterThan(0.9);
  });

  it("shatters the same way every time for the same transition", () => {
    const a = frameScene(cam, frame("shatter", 1, 0.4)).ops.map((o) => o.g.T);
    const b = frameScene(cam, frame("shatter", 1, 0.4)).ops.map((o) => o.g.T);
    expect(a).toEqual(b);
  });
});
