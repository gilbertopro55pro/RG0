import { describe, expect, it } from "vitest";
import { cameraFor } from "@/lib/slideshow3d/math3d";
import { PIP_STYLES, pipPlan, pipStage, pipStyleAt, pipTimes, poseBox, type PipBox, type PipInput, type SegTiming } from "@/lib/reels/proshow";
import { reelTimeline, segmentTiming } from "@/lib/reels/render";
import { templateById, type ReelSettings } from "@/lib/reels/templates";

const timing = (life: number, over: Partial<SegTiming> = {}): SegTiming => ({ life, lead: 0, end: life, grid: null, gridAt: 0, title: false, ...over });

const SIZES: [number, number][] = [
  [1080, 1920],
  [1080, 1350],
  [1080, 1080],
  [360, 640],
];
const ASPECTS = [
  [1.5, 0.667, 1.5],
  [0.667, 1.5, 0.667],
  [1, 1, 2.4],
  [1.78, 0.5, 1.33],
];

function* inputs(): Generator<PipInput> {
  for (const [W, H] of SIZES) {
    for (const insets of [1, 2]) {
      for (const life of [0.7, 1.6, 3, 5]) {
        for (const title of [null, "top", "center", "bottom"] as const) {
          for (let k = 0; k < 9; k++) {
            yield { W, H, k, seed: 3, aspects: ASPECTS[k % ASPECTS.length], insets, timing: timing(life, { lead: k ? 0.4 : 0, title: !!title }), title };
          }
        }
      }
    }
  }
}

const area = (b: PipBox) => (b.right - b.left) * (b.bottom - b.top);
const offScreen = (b: PipBox, W: number, H: number) => b.right <= 1 || b.left >= W - 1 || b.bottom <= 1 || b.top >= H - 1;

describe("ProShow picture in picture: the motion of each segment", () => {
  it("goes through every style before one comes back, never the same twice in a row", () => {
    for (const insets of [1, 2]) {
      const n = insets === 1 ? PIP_STYLES.length : PIP_STYLES.length - 1;
      for (let seed = 1; seed <= 6; seed++) {
        const seq = Array.from({ length: n * 4 }, (_, k) => pipStyleAt(k, seed, insets));
        for (let k = 1; k < seq.length; k++) expect(seq[k]).not.toBe(seq[k - 1]);
        for (let r = 0; r < 4; r++) expect(new Set(seq.slice(r * n, r * n + n)).size).toBe(n);
        // Two framed photos: no "pair" (it shows the same two photos as one inset does).
        if (insets === 2) expect(seq).not.toContain("pair");
      }
    }
  });

  it("another seed gives another order", () => {
    const a = Array.from({ length: 8 }, (_, k) => pipStyleAt(k, 1, 1)).join();
    const b = Array.from({ length: 8 }, (_, k) => pipStyleAt(k, 2, 1)).join();
    expect(a).not.toBe(b);
  });

  it("is a pure function of its input (the preview and the exported file are the same)", () => {
    const input: PipInput = { W: 1080, H: 1920, k: 4, seed: 9, aspects: [1.5, 0.75, 1.2], insets: 2, timing: timing(3, { lead: 0.5 }), title: null };
    const a = pipPlan(input);
    const b = pipPlan(input);
    expect(a.style).toBe(b.style);
    for (let i = 0; i < a.cards.length; i++) {
      for (const u of [0, 0.4, 1.1, 2, 2.9]) expect(a.cards[i].pose(u)).toEqual(b.cards[i].pose(u));
    }
  });
});

describe("ProShow picture in picture: where the layers are", () => {
  it("at rest, every layer is whole inside the stage, away from the very top and bottom of a 9:16 reel", () => {
    let checked = 0;
    for (const input of inputs()) {
      const cam = cameraFor(input.W, input.H);
      const plan = pipPlan(input);
      const st = plan.stage;
      expect(st.left).toBeGreaterThanOrEqual(0);
      expect(st.right).toBeLessThanOrEqual(input.W);
      if (input.H / input.W > 1.5) {
        expect(st.top).toBeGreaterThanOrEqual(input.H * 0.085 - 1e-6);
        expect(st.bottom).toBeLessThanOrEqual(input.H * 0.84 + 1e-6);
      }
      for (const c of plan.cards) {
        const { land, exitStart } = c.times;
        for (let j = 0; j <= 20; j++) {
          const b = poseBox(cam, c.w, c.h, c.pose(land + ((exitStart - land) * j) / 20));
          expect(b.left).toBeGreaterThanOrEqual(st.left - 1);
          expect(b.right).toBeLessThanOrEqual(st.right + 1);
          expect(b.top).toBeGreaterThanOrEqual(st.top - 1);
          expect(b.bottom).toBeLessThanOrEqual(st.bottom + 1);
          checked++;
        }
        // Big enough to read: at least 4% of the screen (3% each when two share the stage).
        expect((c.w * c.h) / (input.W * input.H)).toBeGreaterThan(plan.cards.length > 1 ? 0.03 : 0.04);
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });

  it("comes in from outside: off the screen, invisible, or tiny when it starts; gone when it ends", () => {
    for (const input of inputs()) {
      const cam = cameraFor(input.W, input.H);
      const plan = pipPlan(input);
      for (const c of plan.cards) {
        const rest = poseBox(cam, c.w, c.h, c.pose(c.times.land));
        for (const u of [c.times.enter, c.times.exitEnd]) {
          const p = c.pose(u);
          const b = poseBox(cam, c.w, c.h, p);
          const outside = p.alpha < 0.05 || offScreen(b, input.W, input.H) || area(b) < area(rest) * 0.05;
          expect(outside, `${plan.style} at ${u}`).toBe(true);
        }
      }
    }
  });

  it("keeps moving while it's on, and the second layer comes in after the first", () => {
    for (const input of inputs()) {
      const plan = pipPlan(input);
      for (const c of plan.cards) {
        const a = c.pose(c.times.land);
        const b = c.pose((c.times.land + c.times.exitStart) / 2);
        const moved = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) + Math.abs(a.rz - b.rz) * 5 + Math.abs(a.ry - b.ry) * 5 + Math.abs(a.s - b.s) * 500;
        expect(moved).toBeGreaterThan(0.5);
      }
      if (plan.cards.length === 2) {
        expect(plan.cards[1].times.enter).toBeGreaterThan(plan.cards[0].times.enter);
        expect(plan.cards[1].times.land).toBeGreaterThan(plan.cards[0].times.land);
      }
      for (const c of plan.cards) {
        const t = c.times;
        expect(t.enter).toBeLessThan(t.land);
        expect(t.land).toBeLessThan(t.exitStart);
        expect(t.exitStart).toBeLessThan(t.exitEnd);
        expect(t.exitEnd).toBeLessThanOrEqual(input.timing.end + 1e-9);
      }
    }
  });

  it("never crosses the title while it's on", () => {
    for (const input of inputs()) {
      if (!input.title) continue;
      const cam = cameraFor(input.W, input.H);
      const plan = pipPlan(input);
      const band = plan.band!;
      expect(band).toBeTruthy();
      for (const c of plan.cards) {
        for (let j = 0; j <= 60; j++) {
          const p = c.pose(c.times.enter + ((c.times.exitEnd - c.times.enter) * j) / 60);
          if (p.alpha <= 0.05) continue;
          const b = poseBox(cam, c.w, c.h, p);
          if (offScreen(b, input.W, input.H)) continue;
          expect(b.bottom <= band.top + 1 || b.top >= band.bottom - 1, `${plan.style} ${input.title}`).toBe(true);
        }
      }
    }
  });

  it("the stage leaves the title's band out", () => {
    for (const pos of ["top", "center", "bottom"] as const) {
      const { stage, band } = pipStage(1080, 1920, pos);
      expect(stage.bottom <= band!.top || stage.top >= band!.bottom).toBe(true);
    }
  });

  it("the pair style puts both photos of the segment in frames over a blurred background", () => {
    let k = 0;
    while (pipStyleAt(k, 5, 1) !== "pair") k++;
    const plan = pipPlan({ W: 1080, H: 1920, k, seed: 5, aspects: [1.5, 0.7], insets: 1, timing: timing(3), title: null });
    expect(plan.background).toBe("blurred");
    expect(plan.cards.map((c) => c.image)).toEqual([0, 1]);
    let other = 0;
    while (pipStyleAt(other, 5, 1) === "pair") other++;
    const normal = pipPlan({ W: 1080, H: 1920, k: other, seed: 5, aspects: [1.5, 0.7], insets: 1, timing: timing(3), title: null });
    expect(normal.background).toBe("photo");
    expect(normal.cards.map((c) => c.image)).toEqual([1]);
  });
});

describe("ProShow picture in picture: on the beat", () => {
  const settings = (over: Partial<ReelSettings> = {}): ReelSettings => ({
    platform: "ig-reel",
    templateId: "beat-pip",
    length: 30,
    fit: "blur",
    blur: 60,
    music: { source: "library", trackId: "celebration", volume: 0.8, offset: 0 },
    transitions: [],
    seed: 1,
    rhythm: 1,
    fx: null,
    text: { title: "", subtitle: "", ending: "", position: "bottom", show: false, styles: {} as ReelSettings["text"]["styles"] },
    ...over,
  });

  it("lands every layer on a beat, and has it gone exactly on the cut", () => {
    for (const tplId of ["beat-pip", "pip", "pip-duo"]) {
      const tpl = templateById(tplId);
      for (const tempo of [
        { bpm: 118, phase: 0 },
        { bpm: 96, phase: 0.21 },
      ]) {
        const s = settings({ templateId: tplId });
        const tl = reelTimeline(24, tpl, s, null, tempo);
        const beat = 60 / tempo.bpm;
        const grid = tl.unit ?? beat;
        const onGrid = (abs: number) => {
          const n = (abs - tl.phase) / grid;
          return Math.abs(n - Math.round(n)) < 1e-6;
        };
        const timeOf = segmentTiming(tl, tpl, s);
        let landed = 0;
        let fromBeat = 0;
        for (let k = 0; k < tl.segments; k++) {
          const tm = timeOf(k);
          const from = tl.starts[k] - tm.lead;
          const plan = pipPlan({ W: 1080, H: 1920, k, seed: 1, aspects: [1.5, 0.75, 1.3], insets: tpl.insets ?? 1, timing: tm, title: null });
          for (const c of plan.cards) {
            if (!onGrid(from + c.times.land)) continue;
            landed++;
            if (onGrid(from + c.times.exitStart)) fromBeat++;
            if (k < tl.segments - 1) expect(from + c.times.exitEnd).toBeCloseTo(tl.starts[k + 1], 6);
          }
        }
        // Most segments are long enough for that (the shortest keep their own times).
        expect(landed).toBeGreaterThan(tl.segments * (tpl.insets ?? 1) * 0.6);
        expect(fromBeat).toBeGreaterThan(landed * 0.6);
      }
    }
  });

  it("the beat times hold even for one short segment of two beats", () => {
    const t = pipTimes(timing(1.0, { grid: 0.5, gridAt: 0 }), 1)[0];
    // Lands on the beat in the middle, goes out after a short hold, gone on the cut.
    expect(t.land).toBeCloseTo(0.5, 9);
    expect(t.exitStart).toBeGreaterThan(0.6);
    expect(t.exitEnd).toBeCloseTo(1, 9);
  });

  it("knows when the title is on, and leaves the last layers gone before the ending text", () => {
    const tpl = templateById("pip");
    const s = settings({ templateId: "pip", music: { source: "none", trackId: "", volume: 1, offset: 0 }, text: { title: "שירה ודן", subtitle: "", ending: "סטודיו", position: "bottom", show: true, styles: {} as ReelSettings["text"]["styles"] } });
    const tl = reelTimeline(10, tpl, s);
    const timeOf = segmentTiming(tl, tpl, s);
    expect(timeOf(0).title).toBe(true);
    expect(timeOf(tl.segments - 1).title).toBe(false);
    const last = timeOf(tl.segments - 1);
    const from = tl.starts[tl.segments - 1] - last.lead;
    expect(from + last.end).toBeLessThanOrEqual(tl.total - tl.tail + 1e-9);
    expect(last.life).toBeGreaterThan(last.end);
  });
});
