import { describe, expect, it } from "vitest";
import { GALLERIES_VIEW_COOKIE, galleriesViewCookie, parseGalleriesView, pickCoverPhoto } from "@/lib/galleriesView";

describe("galleries page view", () => {
  it("is a list unless the cookie says grid", () => {
    expect(parseGalleriesView("grid")).toBe("grid");
    expect(parseGalleriesView("list")).toBe("list");
    expect(parseGalleriesView(undefined)).toBe("list");
    expect(parseGalleriesView("blocks")).toBe("list");
  });

  it("writes a cookie the server reads back", () => {
    const cookie = galleriesViewCookie("grid");
    expect(cookie.startsWith(`${GALLERIES_VIEW_COOKIE}=grid;`)).toBe(true);
    expect(cookie).toContain("path=/");
    expect(parseGalleriesView(cookie.split(";")[0].split("=")[1])).toBe("grid");
  });
});

describe("pickCoverPhoto", () => {
  const photos = [
    { id: "c", sort_order: 3 },
    { id: "a", sort_order: 1 },
    { id: "b", sort_order: 2 },
  ];

  it("takes the chosen cover", () => {
    expect(pickCoverPhoto("b", photos)?.id).toBe("b");
  });

  it("falls back to the first photo by order", () => {
    expect(pickCoverPhoto(null, photos)?.id).toBe("a");
    expect(pickCoverPhoto("deleted", photos)?.id).toBe("a");
  });

  it("a gallery with no photos has no cover", () => {
    expect(pickCoverPhoto("a", [])).toBeNull();
  });
});
