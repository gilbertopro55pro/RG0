import { describe, expect, it } from "vitest";
import { tabKey, type GalleryFolderLike } from "@/lib/galleryFolders";
import { ensureFolderBody, parseEnsureFolderBody, tabCache } from "@/lib/galleryFolderEnsure";

// The tab a client's dropped folder goes to (CLAUDE.md, "לשוניות ראשיות ותת-לשוניות"):
// api/gallery/[token]/ensure-folder and PublicGalleryView.
const f = (id: string, name: string, sort_order: number, parent_id: string | null = null): GalleryFolderLike => ({ id, name, sort_order, parent_id });
const folders = [
  f("book", "בוק בר מצווה", 0),
  f("park", "פארק", 0, "book"),
  f("beach", "חוף", 1, "book"),
  f("aliyah", "עלייה לתורה", 1),
  f("vibe", "1.אוירה", 0, "aliyah"),
  f("solo", "אחר", 2),
];

describe("a client's dropped folder", () => {
  it("asks for a sub-tab under the open event, under a main tab by name, or for a main tab", () => {
    expect(ensureFolderBody({ kind: "tab", name: "6.ריקודים", parent: { id: "aliyah" } })).toEqual({ folderName: "6.ריקודים", parentId: "aliyah" });
    expect(ensureFolderBody({ kind: "tab", name: "חוף", parent: { name: "בוק" } })).toEqual({ folderName: "חוף", parentName: "בוק" });
    expect(ensureFolderBody({ kind: "tab", name: "1.אוירה", parent: null })).toEqual({ folderName: "1.אוירה" });
  });

  it("reads what the client sends, and refuses a request without a name", () => {
    expect(parseEnsureFolderBody({ folderName: " חוף ", parentName: " בוק " })).toEqual({ name: "חוף", parent: { name: "בוק" } });
    expect(parseEnsureFolderBody({ folderName: "6", parentId: "aliyah", parentName: "x" })).toEqual({ name: "6", parent: { id: "aliyah" } });
    expect(parseEnsureFolderBody({ folderName: "1.אוירה" })).toEqual({ name: "1.אוירה", parent: null });
    expect(parseEnsureFolderBody({ folderName: "  " })).toBeNull();
    expect(parseEnsureFolderBody(null)).toBeNull();
    expect(parseEnsureFolderBody({ folderName: 5 })).toBeNull();
  });

  it("finds the tabs the gallery already has, both ways a sub-tab can be asked for", () => {
    const cache = tabCache(folders);
    expect(cache.get(tabKey("בוק בר מצווה", null))).toBe("book");
    expect(cache.get(tabKey("חוף", { id: "book" }))).toBe("beach");
    expect(cache.get(tabKey("חוף", { name: "בוק בר מצווה" }))).toBe("beach");
    expect(cache.get(tabKey("חוף", null))).toBeUndefined();
  });
});
