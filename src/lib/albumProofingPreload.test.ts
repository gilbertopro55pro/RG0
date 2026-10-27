import { describe, expect, it } from "vitest";
import { pagesToPreload, spreadImageUrls } from "@/lib/albumProofingPreload";

const page = (over: Partial<Parameters<typeof spreadImageUrls>[0]> = {}) => ({
  layout: "custom",
  photo1: { url: "p1" },
  photo2: null,
  elements: [] as { type: string; url?: string }[],
  background: null,
  ...over,
});

describe("spreadImageUrls", () => {
  it("takes a designed page's frames and its background, once each", () => {
    const urls = spreadImageUrls(
      page({
        elements: [{ type: "photo", url: "a" }, { type: "text" }, { type: "photo", url: "b" }, { type: "photo", url: "a" }],
        background: { url: "a" },
      })
    );
    expect(urls).toEqual(["a", "b"]);
  });

  it("takes an older page's one or two photos, not its frames", () => {
    expect(spreadImageUrls(page({ layout: "split", photo2: { url: "p2" }, elements: [{ type: "photo", url: "x" }] }))).toEqual(["p1", "p2"]);
    expect(spreadImageUrls(page({ layout: "feature", background: { url: "bg" } }))).toEqual(["p1", "bg"]);
  });
});

describe("pagesToPreload", () => {
  it("loads the next two, the one before and the last page", () => {
    expect(pagesToPreload(5, 20)).toEqual([6, 7, 4, 19]);
  });

  it("from the cover: the first pages and the last", () => {
    expect(pagesToPreload(-1, 20)).toEqual([0, 1, 19]);
  });

  it("near the end: nothing past the last page, nothing twice", () => {
    expect(pagesToPreload(18, 20)).toEqual([19, 17]);
    expect(pagesToPreload(19, 20)).toEqual([18]);
  });

  it("a one-page album has nothing to load ahead", () => {
    expect(pagesToPreload(0, 1)).toEqual([]);
  });
});
