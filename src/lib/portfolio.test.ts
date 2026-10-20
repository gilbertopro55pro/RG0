import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/serviceRole", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/storage", () => ({ getPublicPreviewUrl: (p: string) => p, getSignedDownloadUrl: async (_b: string, p: string) => p }));

const { NO_CATEGORY_TAB, portfolioTabNames, tabCoverPhoto, tabCoverVideo } = await import("@/lib/portfolio");

// The picture on a one-tab portfolio link's preview card (app/p/[slug]/og, owner 2026-10-20).

const photo = (id: string, tab: string | null) => ({ id, portfolio_category: tab });
// Newest first, as loadPortfolio returns them.
const PHOTOS = [photo("p1", "חינה"), photo("p2", "חתונה"), photo("p3", "חינה"), photo("p4", null)];

describe("tabCoverPhoto", () => {
  it("takes the cover the photographer picked for the tab", () => {
    expect(tabCoverPhoto(PHOTOS, { חינה: "p3" }, "חינה")?.id).toBe("p3");
  });

  it("takes the tab's newest photo without a pick, or when the picked one left the tab", () => {
    expect(tabCoverPhoto(PHOTOS, null, "חינה")?.id).toBe("p1");
    expect(tabCoverPhoto(PHOTOS, { חינה: "p2" }, "חינה")?.id).toBe("p1");
  });

  it("finds the untagged photos' tab, and nothing for a tab with only videos", () => {
    expect(tabCoverPhoto(PHOTOS, null, NO_CATEGORY_TAB)?.id).toBe("p4");
    expect(tabCoverPhoto(PHOTOS, null, "חתונות - קליפים")).toBeNull();
  });
});

describe("portfolioTabNames", () => {
  it("lists every tab once, the videos' too", () => {
    expect(portfolioTabNames(PHOTOS, [{ portfolio_category: "חתונות - קליפים" }, { portfolio_category: "חינה" }]).sort()).toEqual(
      ["חינה", "חתונה", NO_CATEGORY_TAB, "חתונות - קליפים"].sort()
    );
  });
});

describe("tabCoverVideo", () => {
  const VIDEOS = [
    { portfolio_category: "חתונות - קליפים", poster_path: null },
    { portfolio_category: "חתונות - קליפים", poster_path: "previews/g/v2-poster.webp" },
    { portfolio_category: "חתונות - קליפים", poster_path: "previews/g/v3-poster.webp" },
  ];

  it("takes the newest video of the tab that has a still frame", () => {
    expect(tabCoverVideo(VIDEOS, "חתונות - קליפים")?.poster_path).toBe("previews/g/v2-poster.webp");
  });

  it("finds nothing before any frame is made, or in another tab", () => {
    expect(tabCoverVideo([VIDEOS[0]], "חתונות - קליפים")).toBeNull();
    expect(tabCoverVideo(VIDEOS, "חינה")).toBeNull();
  });
});
