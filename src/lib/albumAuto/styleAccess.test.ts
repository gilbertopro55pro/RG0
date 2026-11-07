import { describe, expect, it } from "vitest";
import { allowedAutoStyle, autoStylesFor } from "./styleAccess";

describe("the automatic album's styles", () => {
  it("every photographer gets קו נקי and קטלוג; the admin account gets all four", () => {
    expect(autoStylesFor(false).map((s) => s.id)).toEqual(["clean", "catalog"]);
    expect(autoStylesFor(true).map((s) => s.id)).toEqual(["clean", "catalog", "scribble", "modern"]);
  });

  it("a style that isn't open (or unknown) falls back to קו נקי", () => {
    expect(allowedAutoStyle("catalog", false)).toBe("catalog");
    expect(allowedAutoStyle("modern", false)).toBe("clean");
    expect(allowedAutoStyle("modern", true)).toBe("modern");
    expect(allowedAutoStyle("nope", true)).toBe("clean");
  });
});
