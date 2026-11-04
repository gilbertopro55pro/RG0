import { describe, expect, it } from "vitest";
import { labelsInUse, normalizePhotoLabel, PHOTO_LABEL_MAX } from "@/lib/photoLabels";

describe("normalizePhotoLabel", () => {
  it("trims and collapses spaces", () => {
    expect(normalizePhotoLabel("  בלוק   זכוכית ")).toBe("בלוק זכוכית");
  });

  it("treats empty, blank and non-text as no label (clearing the diamond)", () => {
    expect(normalizePhotoLabel("")).toBeNull();
    expect(normalizePhotoLabel("   ")).toBeNull();
    expect(normalizePhotoLabel(null)).toBeNull();
    expect(normalizePhotoLabel(5)).toBeNull();
  });

  it("caps the length", () => {
    expect(normalizePhotoLabel("א".repeat(100))).toHaveLength(PHOTO_LABEL_MAX);
  });
});

describe("labelsInUse", () => {
  it("lists each label once, ignoring photos without one", () => {
    const photos = [
      { custom_label: "קנבס" },
      { custom_label: null },
      { custom_label: "אלבום" },
      { custom_label: "קנבס" },
      { custom_label: " קנבס " },
    ];
    expect(labelsInUse(photos)).toEqual(["אלבום", "קנבס"]);
  });

  it("is empty for a gallery without labels", () => {
    expect(labelsInUse([{ custom_label: null }])).toEqual([]);
  });
});
