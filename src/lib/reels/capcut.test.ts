import { describe, expect, it } from "vitest";
import {
  bwPopAmount,
  burnPhase,
  cameraAt,
  coverScale,
  cutClock,
  hitEnvelope,
  inExpo,
  introVeil,
  kineticStep,
  outBack,
  outElastic,
  outExpo,
  panelDraws,
  panelPhase,
  settle,
  trackSpread,
  visualOrder,
  wordAnim,
  wordSlots,
  type CameraSpec,
  type PanelVariant,
} from "@/lib/reels/capcut";
import { reelTimeline, transitionPool } from "@/lib/reels/render";
import { REEL_TEMPLATES, REEL_TRANSITIONS, defaultLineStyles, templateById, type ReelSettings } from "@/lib/reels/templates";
import { REEL_TRACKS } from "@/lib/reels/music";

function settings(patch: Partial<ReelSettings> = {}): ReelSettings {
  return {
    platform: "ig-reel",
    templateId: "cc-velocity",
    length: 15,
    fit: "blur",
    blur: 60,
    music: { source: "none", trackId: "energy", volume: 0.8, offset: 0 },
    transitions: [],
    seed: 1,
    rhythm: 1,
    fx: null,
    text: { title: "דנה ואורי", subtitle: "4.11.2026", ending: "סטודיו", position: "bottom", show: true, styles: defaultLineStyles(REEL_TEMPLATES[0]) },
    ...patch,
  };
}

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const W = 1080;
const H = 1920;

// A timeline of four 1-second photos, beat 0.5s, no ending text.
const TL = { segments: 4, starts: [0, 1, 2, 3], durs: [1, 1, 1, 1], total: 4, tail: 0, beat: 0.5, phase: 0 };

describe("easing", () => {
  it("starts at 0 and ends at 1", () => {
    for (const f of [outExpo, inExpo, (x: number) => outBack(x), outElastic]) {
      expect(close(f(0), 0, 1e-3)).toBe(true);
      expect(close(f(1), 1, 1e-6)).toBe(true);
    }
  });

  it("back and elastic overshoot past 1 on the way", () => {
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => outBack(i / 50, 1.4)))).toBeGreaterThan(1.02);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => outElastic(i / 50)))).toBeGreaterThan(1.1);
  });

  it("settle starts at 1 and dies out", () => {
    expect(settle(0)).toBe(1);
    expect(Math.abs(settle(1.5))).toBeLessThan(0.01);
    expect(settle(-0.1)).toBe(0);
  });
});

describe("cutClock", () => {
  it("knows the segment, the time since its cut and until the next", () => {
    const c = cutClock(1.25, TL, 2);
    expect(c.k).toBe(1);
    expect(close(c.dt, 0.25)).toBe(true);
    expect(close(c.toNext, 0.75)).toBe(true);
    expect(close(c.u, 0.25)).toBe(true);
    expect(c.accent).toBe(false);
    expect(c.nextAccent).toBe(true);
    expect(cutClock(2.1, TL, 2).accent).toBe(true);
    expect(cutClock(3.5, TL, 2).toNext).toBe(Infinity);
  });

  it("counts the beats between cuts, not the ones on a cut", () => {
    expect(close(cutClock(1.6, TL, 2).beatDt, 0.1)).toBe(true);
    expect(cutClock(1.1, TL, 2).beatDt).toBe(Infinity);
    expect(cutClock(1.6, { ...TL, beat: null }, 2).beatDt).toBe(Infinity);
  });
});

describe("the camera", () => {
  const corners = (W: number, H: number, s: number, rot: number, x: number, y: number) => {
    // Every corner of the canvas must fall inside the moved frame.
    const out: boolean[] = [];
    for (const [px, py] of [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ]) {
      const dx = px - (W / 2 + x * W);
      const dy = py - (H / 2 + y * H);
      const c = Math.cos(-rot);
      const sn = Math.sin(-rot);
      const lx = (dx * c - dy * sn) / s;
      const ly = (dx * sn + dy * c) / s;
      out.push(Math.abs(lx) <= W / 2 + 0.5 && Math.abs(ly) <= H / 2 + 0.5);
    }
    return out.every(Boolean);
  };

  it("a turned frame zoomed by coverScale still covers the canvas", () => {
    for (const deg of [0, 2, 5, 8, -6]) {
      const r = (deg * Math.PI) / 180;
      expect(corners(W, H, coverScale(W, H, r), r, 0, 0)).toBe(true);
    }
  });

  it("punches in on the cut, overshoots and settles", () => {
    const spec: CameraSpec = { hit: "punch", hitScale: 0.2, hitLen: 0.45 };
    const at = (t: number) => cameraAt(spec, cutClock(t, TL, 2), W, H).scale;
    expect(close(at(1), 1.2, 1e-6)).toBe(true);
    expect(at(1.1)).toBeLessThan(at(1.02));
    expect(close(at(1.9), 1, 1e-6)).toBe(true);
    // The first photo has no cut before it.
    expect(close(at(0.3), 1)).toBe(true);
  });

  it("never leaves an edge uncovered, whatever it does", () => {
    const spec: CameraSpec = { hit: "bounce", hitScale: 0.22, hitLen: 0.75, base: 1.06, rot: 6, shake: 0.03, pulse: 0.05, weave: 0.004 };
    for (let t = 0; t < 4; t += 0.013) {
      const cam = cameraAt(spec, cutClock(t, TL, 2), W, H);
      expect(corners(W, H, cam.scale, cam.rot, cam.x, cam.y), `t=${t.toFixed(3)}`).toBe(true);
    }
  });

  it("whips into a strong cut: the old photo flies out, the new one comes in from the other side, blurred at the cut", () => {
    const spec: CameraSpec = { whip: "accent", whipLen: 0.15 };
    const before = cameraAt(spec, cutClock(1.99, TL, 2), W, H);
    const after = cameraAt(spec, cutClock(2.01, TL, 2), W, H);
    expect(before.wx).toBeGreaterThan(0.4);
    expect(after.wx).toBeLessThan(-0.4);
    expect(before.smear).toBeGreaterThan(0.1);
    expect(after.smear).toBeGreaterThan(0.1);
    // No whip into the cut at 1s (not a strong one), none in the middle of a photo.
    expect(cameraAt(spec, cutClock(0.99, TL, 2), W, H).wx).toBe(0);
    expect(cameraAt(spec, cutClock(2.5, TL, 2), W, H).wx).toBe(0);
    expect(cameraAt(spec, cutClock(2.5, TL, 2), W, H).smear).toBe(0);
  });

  it("ramps the zoom up into the cut", () => {
    const spec: CameraSpec = { ramp: 0.12 };
    const s = (t: number) => cameraAt(spec, cutClock(t, TL, 2), W, H).scale;
    expect(s(1.3)).toBeLessThan(1.001);
    expect(s(1.99)).toBeGreaterThan(1.1);
  });

  it("is the same at the same time", () => {
    const spec: CameraSpec = { hit: "punch", rot: 4, shake: 0.03, weave: 0.004, whip: "all" };
    expect(cameraAt(spec, cutClock(2.04, TL, 2), W, H)).toEqual(cameraAt(spec, cutClock(2.04, TL, 2), W, H));
  });
});

describe("panels", () => {
  const variants: PanelVariant[] = ["strips", "halves", "grid", "triple"];

  it("end on the whole frame", () => {
    for (const v of variants) {
      expect(panelDraws(v, 1)).toEqual([{ s: [0, 0, 1, 1], d: [0, 0, 1, 1] }]);
      // Just before the end they already cover the frame.
      const near = panelDraws(v, 0.999, 3);
      const area = near.reduce((a, p) => a + Math.max(0, Math.min(1, p.d[0] + p.d[2]) - Math.max(0, p.d[0])) * Math.max(0, Math.min(1, p.d[1] + p.d[3]) - Math.max(0, p.d[1])), 0);
      expect(area, v).toBeGreaterThan(0.97);
    }
  });

  it("strips come in staggered from alternate sides", () => {
    const d = panelDraws("strips", 0.05, 0);
    expect(d).toHaveLength(3);
    expect(Math.sign(d[0].d[1])).toBe(-Math.sign(d[1].d[1]));
    expect(Math.abs(d[2].d[1])).toBeGreaterThan(Math.abs(d[0].d[1]) - 1e-9);
  });

  it("the grid shows four copies, then zooms into one of them", () => {
    expect(panelDraws("grid", 0.3, 0)).toHaveLength(4);
    const end = panelDraws("grid", 0.999, 2);
    const big = end.find((p) => p.d[2] > 0.95);
    expect(big).toBeDefined();
  });

  it("split on the chosen cuts, for a short while", () => {
    const c = cutClock(2.1, TL, 2);
    expect(panelPhase(c, 1)).not.toBeNull();
    expect(panelPhase(cutClock(2.95, TL, 2), 1)).toBeNull();
    expect(panelPhase(cutClock(1.1, TL, 2), 2)).toBeNull();
    expect(panelPhase(cutClock(0.1, TL, 2), 1)).toBeNull();
  });
});

describe("light and colour", () => {
  it("the burn runs around a strong cut and is brightest at the cut", () => {
    const before = burnPhase(cutClock(1.9, TL, 2), 2);
    expect(before?.cut).toBe(2);
    const at = burnPhase(cutClock(2.0, TL, 2), 2);
    expect(close(at!.q, 0.2 / 0.55, 1e-6)).toBe(true);
    expect(burnPhase(cutClock(2.5, TL, 2), 2)).toBeNull();
    expect(burnPhase(cutClock(0.95, TL, 2), 2)).toBeNull();
  });

  it("black and white pops into colour on the next beat, only on photos held long enough", () => {
    const tl = { ...TL, durs: [1, 1, 1, 1] };
    expect(bwPopAmount(cutClock(1.2, tl, 2))).toBe(1);
    expect(bwPopAmount(cutClock(1.7, tl, 2))).toBe(0);
    const short = { segments: 3, starts: [0, 0.5, 1], durs: [0.5, 0.5, 1], total: 2, tail: 0, beat: 0.5, phase: 0 };
    expect(bwPopAmount(cutClock(0.6, short, 2))).toBe(0);
  });

  it("the hit is strongest on the cut and fades", () => {
    expect(hitEnvelope(cutClock(2.0, TL, 2))).toBeGreaterThan(hitEnvelope(cutClock(2.3, TL, 2)));
    expect(hitEnvelope(cutClock(0.2, TL, 2))).toBe(0);
  });

  it("the opening veils start covered and clear", () => {
    expect(introVeil("white", 0).white).toBe(1);
    expect(introVeil("white", 1).white).toBe(0);
    expect(introVeil("black", 0).black).toBe(1);
    expect(introVeil("black", 1).black).toBe(0);
    expect(introVeil("glitch", 0)).toEqual({ white: 0, black: 0 });
  });
});

describe("text word by word", () => {
  it("keeps Latin words and numbers in their own order inside a right-to-left line", () => {
    expect(visualOrder(["יעל", "ואיתי"], true)).toEqual([1, 0]);
    expect(visualOrder(["חתונה", "4.11.2026"], true)).toEqual([1, 0]);
    expect(visualOrder(["Dana", "&", "Ori", "חתונה"], true)).toEqual([3, 0, 1, 2]);
    expect(visualOrder(["Dana", "&", "Ori"], false)).toEqual([0, 1, 2]);
  });

  it("lays the words out around the middle", () => {
    const x = wordSlots([100, 50], 10);
    expect(x).toEqual([-30, 55]);
  });

  it("a word is hidden before its turn and settles in place", () => {
    for (const style of ["pop", "slam", "blurin", "track"] as const) {
      expect(wordAnim(style, -0.1).a).toBe(0);
      const done = wordAnim(style, 3);
      expect(done.a).toBe(1);
      expect(close(done.scale, 1, 0.01)).toBe(true);
      expect(close(done.dy, 0, 0.01)).toBe(true);
      expect(done.smear).toBeLessThan(0.01);
    }
    expect(wordAnim("slam", 0).scale).toBeGreaterThan(2);
    expect(trackSpread(0)).toBeGreaterThan(1.8);
    expect(close(trackSpread(3), 1, 1e-3)).toBe(true);
  });

  it("steps half a beat, within limits", () => {
    expect(kineticStep(0.5)).toBe(0.25);
    expect(kineticStep(0.2)).toBe(0.12);
    expect(kineticStep(null)).toBe(0.14);
  });
});

describe("the CapCut templates", () => {
  const cc = REEL_TEMPLATES.filter((t) => t.look);
  const valid = new Set(REEL_TRANSITIONS.map((x) => x.id));

  it("there are eight, after the others, each with a song from the library and valid transitions", () => {
    expect(cc.length).toBe(8);
    expect(REEL_TEMPLATES.findIndex((t) => t.look)).toBeGreaterThan(REEL_TEMPLATES.findIndex((t) => t.id === "beat-pip"));
    expect(new Set(cc.map((t) => t.id)).size).toBe(8);
    for (const t of cc) {
      expect(t.frame).toBe("full");
      expect(REEL_TRACKS.some((x) => x.id === t.beat?.track), t.id).toBe(true);
      for (const x of t.transitions) expect(valid.has(x), `${t.id}: ${x}`).toBe(true);
    }
  });

  it("with a song, every cut is on its beat; without one, the reel still fills its length", () => {
    for (const t of cc) {
      const bpm = REEL_TRACKS.find((x) => x.id === t.beat!.track)!.bpm;
      const tl = reelTimeline(14, t, settings({ templateId: t.id, length: 15 }), null, { bpm, phase: 0 });
      const beat = 60 / bpm;
      for (const s of tl.starts) expect(close(s / beat, Math.round(s / beat), 1e-6), `${t.id} ${s}`).toBe(true);
      const free = reelTimeline(14, t, settings({ templateId: t.id, length: 15 }));
      expect(close(free.durs.reduce((x, y) => x + y, 0) + free.tail, 15, 1e-6), t.id).toBe(true);
      expect(transitionPool(t, settings({ templateId: t.id })).length).toBeGreaterThan(0);
    }
  });

  it("the default template is one of them", async () => {
    const { DEFAULT_REEL_TEMPLATE_ID } = await import("@/lib/reels/templates");
    expect(templateById(DEFAULT_REEL_TEMPLATE_ID).look).toBeDefined();
  });
});
