import { describe, expect, it } from "vitest";
import { selectionKindOf, selectionTargetFor, selectionTargetState, shouldCelebrate, validCount } from "@/lib/selectionTarget";

// The photo count the client picks for the album, per event type (owner, 2026-10-27).
describe("selectionKindOf", () => {
  it.each([
    ["חתונה", "חתונה"],
    ["יעל ואיתי, חתונה", "חתונה"],
    ["חתונת דנה ואורי", "חתונה"],
    ["חינה", "חינה"],
    ["בר מצווה", "בר מצווה"],
    ["בר-מצוה של איתי", "בר מצווה"],
    ["בר מצווה-מגנטים", "בר מצווה"],
    ["בת מצווה", "בת מצווה"],
    ["לבת המצווה של נועה", "בת מצווה"],
    ["עלייה לתורה", "עלייה לתורה"],
    ["עלייה לתורה - אורי", "עלייה לתורה"],
    ["עליה לתורה", "עלייה לתורה"],
    ["ברית", "ברית"],
    ["ברית מילה", "ברית"],
    ["בוק בר מצווה", "בוק בר מצווה"],
    ["בוק בת מצווה - רומי", "בוק בת מצווה"],
    ["בוק לבת המצווה", "בוק בת מצווה"],
  ])("reads %s as %s", (text, kind) => {
    expect(selectionKindOf(text)).toBe(kind);
  });
  it("leaves other events and look-alike words alone", () => {
    expect(selectionKindOf("הכנסת ספר תורה")).toBeNull();
    expect(selectionKindOf("צילומי בוקר")).toBeNull();
    expect(selectionKindOf("מבחינה")).toBeNull();
    expect(selectionKindOf("")).toBeNull();
    expect(selectionKindOf(null)).toBeNull();
  });
});

describe("selectionTargetFor", () => {
  it("takes the owner's defaults", () => {
    expect(selectionTargetFor({ eventType: "חתונה" })).toBe(200);
    expect(selectionTargetFor({ eventType: "חינה" })).toBe(150);
    expect(selectionTargetFor({ eventType: "ברית" })).toBe(150);
    expect(selectionTargetFor({ eventType: "בוק בת מצווה" })).toBe(70);
  });
  it("falls back to the gallery title when the event has no type", () => {
    expect(selectionTargetFor({ eventType: null, title: "יעל ואיתי, חתונה" })).toBe(200);
    expect(selectionTargetFor({ eventType: null, title: "גלריה" })).toBeNull();
  });
  it("uses the photographer's own number, for a default type or an exact custom type", () => {
    expect(selectionTargetFor({ eventType: "חתונה", targets: { חתונה: 250 } })).toBe(250);
    expect(selectionTargetFor({ eventType: "בר מצווה-מגנטים", targets: { "בר מצווה": 120 } })).toBe(120);
    expect(selectionTargetFor({ eventType: "הכנסת ספר תורה", targets: { "הכנסת ספר תורה": 90 } })).toBe(90);
  });
  it("is nothing for a type switched off, or a bad number", () => {
    expect(selectionTargetFor({ eventType: "חתונה", targets: { חתונה: null } })).toBeNull();
    expect(selectionTargetFor({ eventType: "חתונה", targets: { חתונה: 0 } })).toBeNull();
  });
});

describe("validCount", () => {
  it("accepts whole numbers from 1 to 2000", () => {
    expect(validCount(1)).toBe(1);
    expect(validCount(2000)).toBe(2000);
    expect(validCount(2001)).toBeNull();
    expect(validCount(12.5)).toBeNull();
    expect(validCount("150")).toBeNull();
  });
});

describe("selectionTargetState and shouldCelebrate", () => {
  it("tells below, on and past the target", () => {
    expect(selectionTargetState(10, null)).toBe("none");
    expect(selectionTargetState(149, 150)).toBe("below");
    expect(selectionTargetState(150, 150)).toBe("reached");
    expect(selectionTargetState(160, 150)).toBe("over");
  });
  it("celebrates once, only when the count climbs to the target", () => {
    expect(shouldCelebrate(149, 150, 150, false)).toBe(true);
    expect(shouldCelebrate(140, 155, 150, false)).toBe(true);
    expect(shouldCelebrate(150, 151, 150, false)).toBe(false);
    expect(shouldCelebrate(149, 150, 150, true)).toBe(false);
    expect(shouldCelebrate(149, 150, null, false)).toBe(false);
  });
});
