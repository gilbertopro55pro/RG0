import { describe, expect, it } from "vitest";
import {
  SHOW_LIFE_SECONDS,
  SHOW_SLIDE_SECONDS,
  SHOW_TRANSITION_SECONDS,
  TRANSITIONS,
  driftAt,
  makeShowPlan,
  pickTransitions,
  seededRandom,
  showMomentAt,
  shuffledOrder,
} from "@/lib/slideshow3d/plan";
import { SLIDE_SECONDS, slideshowSeconds } from "@/lib/slideshowVideo";

// The 3D slideshow (owner, 2026-11-02): photos in a random order, a different 3D effect into each.
describe("3D slideshow plan", () => {
  it("shuffles into a permutation, the same one for the same seed", () => {
    for (const n of [0, 1, 2, 5, 37, 200]) {
      const order = shuffledOrder(n, seededRandom(99));
      expect(order).toHaveLength(n);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(shuffledOrder(n, seededRandom(99))).toEqual(order);
    }
    // A different seed, a different order (for anything but a tiny list).
    expect(shuffledOrder(40, seededRandom(1))).not.toEqual(shuffledOrder(40, seededRandom(2)));
    // Actually shuffled: not the gallery's order.
    expect(shuffledOrder(40, seededRandom(1))).not.toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  it("has at least 12 different effects", () => {
    expect(new Set(TRANSITIONS).size).toBeGreaterThanOrEqual(12);
  });

  it("never shows the same effect twice in a row, also around the loop", () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const n of [2, 3, 4, 15, 16, 31, 60]) {
        const list = pickTransitions(n, seededRandom(seed));
        expect(list).toHaveLength(n);
        for (let i = 1; i < n; i++) expect(list[i].id).not.toBe(list[i - 1].id);
        // The screen loops from the last photo back to the first with list[0].
        expect(list[0].id).not.toBe(list[n - 1].id);
        for (const t of list) expect([1, -1]).toContain(t.dir);
      }
    }
  });

  it("goes through every effect before repeating one", () => {
    const list = pickTransitions(TRANSITIONS.length, seededRandom(7));
    expect(new Set(list.map((t) => t.id)).size).toBe(TRANSITIONS.length);
  });

  it("makes the same plan from the same seed (screen and video agree)", () => {
    expect(makeShowPlan(12, 123456)).toEqual(makeShowPlan(12, 123456));
    expect(makeShowPlan(12, 123456)).not.toEqual(makeShowPlan(12, 654321));
    const plan = makeShowPlan(9, 5);
    expect(plan.order).toHaveLength(9);
    expect(plan.transitions).toHaveLength(9);
    expect(plan.drifts).toHaveLength(9);
  });

  it("keeps 3 seconds a photo, with the transition in during the first 1.2", () => {
    expect(SHOW_SLIDE_SECONDS).toBe(SLIDE_SECONDS);
    expect(slideshowSeconds(5)).toBe(15);
    expect(SHOW_TRANSITION_SECONDS).toBeGreaterThanOrEqual(0.9);
    expect(SHOW_TRANSITION_SECONDS).toBeLessThanOrEqual(1.3);
    // The opening entrance of the first photo.
    expect(showMomentAt(0, 5)).toEqual({ index: 0, age: 0, prev: null, prevAge: 3, progress: 0 });
    expect(showMomentAt(0.6, 5).progress).toBeCloseTo(0.5, 6);
    // On, alone.
    expect(showMomentAt(2, 5)).toMatchObject({ index: 0, prev: null, progress: 1 });
    // The move from photo 0 to photo 1: both drawn, photo 0 three seconds older.
    const m = showMomentAt(3.3, 5);
    expect(m.index).toBe(1);
    expect(m.prev).toBe(0);
    expect(m.progress).toBeCloseTo(0.25, 6);
    expect(m.age).toBeCloseTo(0.3, 6);
    expect(m.prevAge).toBeCloseTo(3.3, 6);
    // Just before and after the end of the transition.
    expect(showMomentAt(3 + SHOW_TRANSITION_SECONDS - 1e-6, 5).prev).toBe(0);
    expect(showMomentAt(3 + SHOW_TRANSITION_SECONDS, 5)).toMatchObject({ index: 1, prev: null, progress: 1 });
    // The last photo stays to the end, and past it.
    expect(showMomentAt(14.9, 5)).toMatchObject({ index: 4, prev: null });
    expect(showMomentAt(99, 5).index).toBe(4);
    expect(showMomentAt(1, 0)).toMatchObject({ index: 0, progress: 1, prev: null });
  });

  it("drifts slowly from start to end over a photo's life, then holds", () => {
    const d = makeShowPlan(1, 3).drifts[0];
    const start = driftAt(d, 0);
    const end = driftAt(d, SHOW_LIFE_SECONDS);
    expect(start.ry).toBeCloseTo(d.ry[0], 9);
    expect(end.ry).toBeCloseTo(d.ry[1], 9);
    expect(driftAt(d, 100)).toEqual(end);
    // Subtle: a few degrees, a few percent.
    for (const v of [start, end]) {
      expect(Math.abs(v.ry)).toBeLessThan((8 * Math.PI) / 180);
      expect(Math.abs(v.rx)).toBeLessThan((5 * Math.PI) / 180);
      expect(v.s).toBeGreaterThanOrEqual(1);
      expect(v.s).toBeLessThan(1.15);
    }
  });
});
