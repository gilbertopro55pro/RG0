import { describe, expect, it } from "vitest";
import { eventDateTone, stageProgress, toneStyle, toneVars, TONES } from "@/lib/tones";

// The vivid look (owner, 2026-10-21): five tones with one meaning each, plus neutral.
describe("toneVars / toneStyle", () => {
  it("names each tone's solid, text and tint variables", () => {
    expect(toneVars("paid")).toEqual({ solid: "var(--tone-paid)", ink: "var(--tone-paid-ink)", bg: "var(--tone-paid-bg)" });
    expect(toneStyle("attention")).toEqual({ background: "var(--tone-attention-bg)", color: "var(--tone-attention-ink)" });
  });

  it("covers the five meanings and neutral", () => {
    expect(TONES).toEqual(["paid", "upcoming", "attention", "pending", "creative", "neutral"]);
  });
});

describe("stageProgress", () => {
  it("counts the done stages", () => {
    expect(stageProgress([{ done: true }, { done: true }, { done: false }, { done: false }])).toEqual({ done: 2, total: 4, pct: 50 });
    expect(stageProgress([{ done: true }, { done: false }, { done: false }])).toEqual({ done: 1, total: 3, pct: 33 });
  });

  it("is nothing without stages", () => {
    expect(stageProgress([])).toBeNull();
    expect(stageProgress(null)).toBeNull();
    expect(stageProgress(undefined)).toBeNull();
  });
});

describe("eventDateTone", () => {
  it("closed wins, then freelance, else upcoming (attention is the tags' job)", () => {
    expect(eventDateTone({ closed: true, freelance: true })).toBe("paid");
    expect(eventDateTone({ closed: false, freelance: true })).toBe("creative");
    expect(eventDateTone({ closed: false, freelance: false })).toBe("upcoming");
  });
});
