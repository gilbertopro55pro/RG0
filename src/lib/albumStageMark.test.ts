import { describe, expect, it } from "vitest";
import { stageMarkNotifies } from "@/lib/albumStageMark";

const base = { done: true, hasNotifyText: true, requiresAlbumPdf: false, hasPdfInRequest: false, isStandardAlbumApproval: false };

describe("stageMarkNotifies", () => {
  it("a client-facing stage marked done notifies; undoing doesn't", () => {
    expect(stageMarkNotifies(base)).toBe(true);
    expect(stageMarkNotifies({ ...base, done: false })).toBe(false);
    expect(stageMarkNotifies({ ...base, hasNotifyText: false })).toBe(false);
  });

  it("an album stage marked by hand without a PDF doesn't notify; with the PDF it does", () => {
    expect(stageMarkNotifies({ ...base, requiresAlbumPdf: true })).toBe(false);
    expect(stageMarkNotifies({ ...base, requiresAlbumPdf: true, hasPdfInRequest: true })).toBe(true);
  });

  it("the standard album approval never notifies from here", () => {
    expect(stageMarkNotifies({ ...base, requiresAlbumPdf: true, isStandardAlbumApproval: true })).toBe(false);
  });
});
