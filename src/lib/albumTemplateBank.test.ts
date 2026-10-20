import { describe, expect, it } from "vitest";
import { TEMPLATE_BANK, TEMPLATE_COVERAGE, TEMPLATE_TABS, generateTemplateFrames, templateCoverage, templateTabFor } from "@/lib/albumTemplateBank";
import type { AlbumFrame } from "@/lib/types";

// The owner's rule for the template library (CLAUDE.md, "ספריית התבניות"): every template covers
// 75%–95% of the canvas. Coverage is computed here straight from the frames' geometry.

const area = (frames: AlbumFrame[]) => frames.reduce((s, f) => s + (f.widthPct / 100) * (f.heightPct / 100), 0);

function overlaps(a: AlbumFrame, b: AlbumFrame): boolean {
  const ox = Math.min(a.xPct + a.widthPct, b.xPct + b.widthPct) - Math.max(a.xPct, b.xPct);
  const oy = Math.min(a.yPct + a.heightPct, b.yPct + b.heightPct) - Math.max(a.yPct, b.yPct);
  return ox > 1e-6 && oy > 1e-6;
}

// The frame's real shape on the 16:10 canvas against the print sizes (10×15, 10×7.5, 13×18, either
// way round): how far it is stretched from the closest one (1 = exact).
const PRINT_RATIOS = [2 / 3, 3 / 4, 13 / 18];
function printDrift(f: AlbumFrame): number {
  const real = (f.widthPct / f.heightPct) * (16 / 10);
  return Math.min(...PRINT_RATIOS.flatMap((r) => [r, 1 / r]).map((r) => Math.max(real / r, r / real)));
}

// What's wrong with a template, if anything (an empty list = valid). Collected rather than asserted
// one by one, so a failure names the template and the rule.
function problems(frames: AlbumFrame[]): string[] {
  const out: string[] = [];
  const covered = area(frames);
  if (covered < 0.75 || covered > 0.95) out.push(`coverage ${covered.toFixed(3)}`);
  frames.forEach((f, i) => {
    if (f.xPct < 0 || f.yPct < 0 || f.xPct + f.widthPct > 100 + 1e-9 || f.yPct + f.heightPct > 100 + 1e-9) out.push(`frame ${i} off the canvas`);
    // Cropping in a cell stays under the ~1.35 limit.
    if (printDrift(f) > 1.35) out.push(`frame ${i} stretched ${printDrift(f).toFixed(2)}`);
    for (let j = i + 1; j < frames.length; j++) if (overlaps(f, frames[j])) out.push(`frames ${i} and ${j} overlap`);
  });
  return out;
}

describe("TEMPLATE_COVERAGE", () => {
  it("is 75%–95% of the canvas", () => {
    expect(TEMPLATE_COVERAGE).toEqual({ min: 0.75, max: 0.95 });
  });

  it("templateCoverage is the frames' share of the canvas", () => {
    expect(templateCoverage([{ id: "a", xPct: 0, yPct: 0, widthPct: 50, heightPct: 50 }])).toBeCloseTo(0.25, 10);
    expect(
      templateCoverage([
        { id: "a", xPct: 0, yPct: 0, widthPct: 40, heightPct: 100 },
        { id: "b", xPct: 50, yPct: 0, widthPct: 50, heightPct: 90 },
      ])
    ).toBeCloseTo(0.85, 10);
  });
});

describe("TEMPLATE_BANK", () => {
  it("has 50 templates in each of the 10 tabs, with the tab's photo count", () => {
    expect(TEMPLATE_TABS.map((t) => t.key)).toEqual(["2", "3", "4", "5", "6", "7", "8", "9", "10", "10+"]);
    for (const tab of TEMPLATE_TABS) {
      const templates = TEMPLATE_BANK[tab.key];
      expect(templates).toHaveLength(50);
      for (const t of templates) {
        if (tab.key === "10+") expect(t.frames.length).toBeGreaterThan(10);
        else expect(t.frames.length).toBe(Number(tab.key));
      }
    }
  });

  it("covers 75%–95% of the canvas in every template, without overlapping frames", () => {
    const bad = TEMPLATE_TABS.flatMap((tab) => TEMPLATE_BANK[tab.key].flatMap((t) => problems(t.frames).map((p) => `${tab.key} / ${t.name}: ${p}`)));
    expect(bad).toEqual([]);
  });

  it("agrees with templateCoverage", () => {
    for (const tab of TEMPLATE_TABS) for (const t of TEMPLATE_BANK[tab.key]) expect(templateCoverage(t.frames)).toBeCloseTo(area(t.frames), 10);
  });
});

describe("generateTemplateFrames", () => {
  it("makes exactly n frames within the coverage rule, for any photo count", () => {
    const bad: string[] = [];
    for (let n = 1; n <= 20; n++) {
      for (let seed = 0; seed < 12; seed++) {
        const frames = generateTemplateFrames(n, seed);
        if (frames.length !== n) bad.push(`n=${n} seed=${seed}: ${frames.length} frames`);
        bad.push(...problems(frames).map((p) => `n=${n} seed=${seed}: ${p}`));
      }
    }
    expect(bad).toEqual([]);
  });

  it("is deterministic: the same count and seed give the same frames", () => {
    expect(generateTemplateFrames(6, 42)).toEqual(generateTemplateFrames(6, 42));
    expect(generateTemplateFrames(6, 42)).not.toEqual(generateTemplateFrames(6, 43));
  });
});

describe("templateTabFor", () => {
  it("puts a page in the tab of its photo count", () => {
    expect(templateTabFor(1)).toBe("2");
    expect(templateTabFor(2)).toBe("2");
    expect(templateTabFor(3)).toBe("3");
    expect(templateTabFor(10)).toBe("10");
    expect(templateTabFor(11)).toBe("10+");
    expect(templateTabFor(25)).toBe("10+");
  });
});
