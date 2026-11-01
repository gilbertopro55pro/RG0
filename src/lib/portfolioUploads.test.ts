import { describe, expect, it, vi } from "vitest";

// The module talks to Supabase and the upload engine only inside its async helpers; the pure ones
// tested here never reach them.
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/galleryUploads", () => ({ enqueuePortfolioUpload: vi.fn(), otherTabUpload: () => false }));

import { portfolioTabOptions, portfolioVideoTabs, portfolioVideos } from "@/lib/portfolioUploads";
import type { DroppedFile } from "@/lib/fileDrop";

const MB = 1024 * 1024;
const video = (relativePath: string, size = 5 * MB, type = "video/mp4"): DroppedFile => {
  const name = relativePath.split("/").pop()!;
  const file = new File([], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return { file, relativePath };
};
const where = (entries: { tab: string | null; sub: string | null; file: File }[]) => entries.map((e) => [e.file.name, e.tab, e.sub]);

describe("portfolioTabOptions", () => {
  it("lists every name once, in Hebrew order, skipping empty ones", () => {
    expect(portfolioTabOptions(["חתונה", "בר מצווה", null], ["חתונה", "קליפים", undefined, ""])).toEqual(["בר מצווה", "חתונה", "קליפים"]);
  });

  it("is empty with nothing to list", () => {
    expect(portfolioTabOptions()).toEqual([]);
    expect(portfolioTabOptions([], [null])).toEqual([]);
  });
});

describe("portfolioVideos without a main tab (as before)", () => {
  it("makes the top folder the tab and the folder holding the video the sub-tab; a loose video has no tab", () => {
    const { videos } = portfolioVideos(
      [video("clip.mp4"), video("חתונות/a.mp4"), video("חתונות/דנה ואורי/b.mov", 5 * MB, "video/quicktime"), video("חתונות/2024/1.חופה/c.mp4")],
      400 * MB
    );
    expect(where(videos)).toEqual([
      ["clip.mp4", null, null],
      ["a.mp4", "חתונות", null],
      ["b.mov", "חתונות", "דנה ואורי"],
      ["c.mp4", "חתונות", "1.חופה"],
    ]);
  });

  it("treats a blank main tab as none", () => {
    expect(where(portfolioVideos([video("חתונות/a.mp4")], 400 * MB, "  ").videos)).toEqual([["a.mp4", "חתונות", null]]);
    expect(where(portfolioVideos([video("חתונות/a.mp4")], 400 * MB, null).videos)).toEqual([["a.mp4", "חתונות", null]]);
  });
});

describe("portfolioVideos with a main tab (like the photo box)", () => {
  it("puts a loose video into the main tab itself, and each folder in as a sub-tab named after the folder holding the video", () => {
    const { videos } = portfolioVideos(
      [video("clip.mp4"), video("דנה ואורי/a.mp4"), video("אירועים/1.הכנות/b.mp4"), video(" 2.חופה /c.webm", 5 * MB, "video/webm")],
      400 * MB,
      " חתונה "
    );
    expect(where(videos)).toEqual([
      ["clip.mp4", "חתונה", null],
      ["a.mp4", "חתונה", "דנה ואורי"],
      ["b.mp4", "חתונה", "1.הכנות"],
      ["c.webm", "חתונה", "2.חופה"],
    ]);
  });

  it("keeps the same checks: hidden files skipped, non-videos counted, files over the limit set aside", () => {
    const big = video("סרטים/big.mp4", 401 * MB);
    const result = portfolioVideos([video("סרטים/._a.mp4"), video("סרטים/photo.jpg", MB, "image/jpeg"), big, video("סרטים/ok.m4v", MB, "")], 400 * MB, "קליפים");
    expect(where(result.videos)).toEqual([["ok.m4v", "קליפים", "סרטים"]]);
    expect(result.rejected).toBe(1);
    expect(result.tooBig).toEqual([big.file]);
  });
});

describe("portfolioVideoTabs", () => {
  it("counts each tab's videos and its sub-tabs, numbered sub-tabs by their number, leaving out videos with no tab", () => {
    const { videos } = portfolioVideos(
      [video("loose.mp4"), video("חתונות/3.ריקודים/a.mp4"), video("חתונות/1.הכנות/b.mp4"), video("חתונות/1.הכנות/c.mp4"), video("חתונות/d.mp4"), video("בר מצווה/e.mp4")],
      400 * MB
    );
    expect(portfolioVideoTabs(videos)).toEqual([
      { tab: "חתונות", count: 4, subs: [{ name: "1.הכנות", count: 2 }, { name: "3.ריקודים", count: 1 }] },
      { tab: "בר מצווה", count: 1, subs: [] },
    ]);
  });

  it("gives one tab, the main tab, when one was chosen", () => {
    const { videos } = portfolioVideos([video("x.mp4"), video("2.חופה/a.mp4"), video("הכנות/b.mp4"), video("1.קבלת פנים/c.mp4")], 400 * MB, "חתונה");
    expect(portfolioVideoTabs(videos)).toEqual([
      { tab: "חתונה", count: 4, subs: [{ name: "1.קבלת פנים", count: 1 }, { name: "2.חופה", count: 1 }, { name: "הכנות", count: 1 }] },
    ]);
  });

  it("is empty when no video has a tab", () => {
    expect(portfolioVideoTabs(portfolioVideos([video("a.mp4")], 400 * MB).videos)).toEqual([]);
  });
});
