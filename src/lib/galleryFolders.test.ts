import { describe, expect, it } from "vitest";
import {
  dropTarget,
  expandFolderKeys,
  folderLabel,
  folderTree,
  folderWithChildren,
  lonelyMain,
  mainFolderId,
  nextSortOrder,
  orderedFolders,
  tabCheckState,
  tabKey,
  tabPathFromRelPath,
  tabsInOrder,
  toggleTabKey,
  zipFolderSegments,
} from "@/lib/galleryFolders";

// Main tabs and sub-tabs (CLAUDE.md, "לשוניות ראשיות ותת-לשוניות"): one gallery holding a bar
// mitzvah book and the aliyah, each with its own tabs.
const f = (id: string, name: string, sort_order: number, parent_id: string | null = null) => ({ id, name, sort_order, parent_id });
const book = f("book", "בוק בר מצווה", 0);
const aliyah = f("aliyah", "עלייה לתורה", 1);
const beach = f("beach", "חוף", 1, "book");
const park = f("park", "פארק", 0, "book");
const vibe = f("vibe", "1.אוירה", 0, "aliyah");
const groom = f("groom", "2.חתן", 1, "aliyah");
const folders = [groom, beach, aliyah, vibe, book, park];

describe("the tree of tabs", () => {
  it("orders the main tabs, each with its sub-tabs in their order", () => {
    expect(folderTree(folders).map((n) => [n.folder.id, n.children.map((c) => c.id)])).toEqual([
      ["book", ["park", "beach"]],
      ["aliyah", ["vibe", "groom"]],
    ]);
    expect(orderedFolders(folders).map((x) => x.id)).toEqual(["book", "park", "beach", "aliyah", "vibe", "groom"]);
  });

  it("keeps a gallery with one level of tabs as it was", () => {
    const flat = [f("b", "2.חתן", 1), f("a", "1.אוירה", 0)];
    expect(folderTree(flat).map((n) => [n.folder.id, n.children.length])).toEqual([
      ["a", 0],
      ["b", 0],
    ]);
    expect(lonelyMain(folderTree(flat))).toBeNull();
  });

  it("stands a sub-tab whose main tab isn't there as a main tab (a share that kept only it)", () => {
    expect(folderTree([beach, vibe]).map((n) => n.folder.id)).toEqual(["vibe", "beach"]);
  });

  it("opening a main tab shows its sub-tabs too; a sub-tab shows only itself", () => {
    expect([...folderWithChildren(folders, "book")].sort()).toEqual(["beach", "book", "park"]);
    expect([...folderWithChildren(folders, "beach")]).toEqual(["beach"]);
    expect(mainFolderId(folders, "beach")).toBe("book");
    expect(mainFolderId(folders, "aliyah")).toBe("aliyah");
    expect(mainFolderId(folders, null)).toBeNull();
  });

  it("choosing a main tab chooses its sub-tabs, and other keys stay", () => {
    expect(expandFolderKeys(["aliyah", "none"], folders).sort()).toEqual(["aliyah", "groom", "none", "vibe"]);
    expect(expandFolderKeys(["beach"], folders)).toEqual(["beach"]);
  });

  it("shows the client one row when the gallery is one event in a main tab of its own", () => {
    expect(lonelyMain(folderTree([book, beach, park]))?.folder.id).toBe("book");
    expect(lonelyMain(folderTree(folders))).toBeNull();
    expect(lonelyMain(folderTree([book]))).toBeNull();
  });

  it("names a sub-tab with its main tab, in lists of every tab and in the zip", () => {
    expect(folderLabel(folders, beach)).toBe("בוק בר מצווה › חוף");
    expect(folderLabel(folders, aliyah)).toBe("עלייה לתורה");
    expect(zipFolderSegments(folders, "groom")).toEqual(["עלייה לתורה", "2.חתן"]);
    expect(zipFolderSegments(folders, "book")).toEqual(["בוק בר מצווה"]);
    expect(zipFolderSegments(folders, "gone")).toEqual([]);
  });
});

describe("a dropped folder", () => {
  it("makes the top folder a main tab and the folder that holds the photo its sub-tab", () => {
    expect(tabPathFromRelPath("בוק/חוף/1.jpg")).toEqual({ main: "בוק", sub: "חוף" });
    expect(tabPathFromRelPath("1.אוירה/1.jpg")).toEqual({ main: "1.אוירה", sub: null });
    expect(tabPathFromRelPath("a/b/c/1.jpg")).toEqual({ main: "a", sub: "c" });
    expect(tabPathFromRelPath("1.jpg")).toBeNull();
  });

  it("brings its own main tab when it has folders in it", () => {
    expect(dropTarget(folders, "beach", "עלייה לתורה/3.משפחה/1.jpg")).toEqual({ kind: "tab", name: "3.משפחה", parent: { name: "עלייה לתורה" } });
  });

  it("joins the open event as a sub-tab when that event has sub-tabs", () => {
    expect(dropTarget(folders, "aliyah", "6.ריקודים/1.jpg")).toEqual({ kind: "tab", name: "6.ריקודים", parent: { id: "aliyah" } });
    expect(dropTarget(folders, "groom", "6.ריקודים/1.jpg")).toEqual({ kind: "tab", name: "6.ריקודים", parent: { id: "aliyah" } });
  });

  it("is a tab of its own in a gallery with one level of tabs, also when a tab is open (2026-10-17)", () => {
    const flat = [f("a", "1.אוירה", 0)];
    expect(dropTarget(flat, "a", "2.חתן/1.jpg")).toEqual({ kind: "tab", name: "2.חתן", parent: null });
    expect(dropTarget(folders, null, "2.חתן/1.jpg")).toEqual({ kind: "tab", name: "2.חתן", parent: null });
  });

  it("puts a loose photo in the open tab", () => {
    expect(dropTarget(folders, "beach", "1.jpg")).toEqual({ kind: "open", folderId: "beach" });
    expect(dropTarget(folders, null, "1.jpg")).toEqual({ kind: "open", folderId: null });
  });

  it("opens its tabs in the order of their names, whatever order the files came in (2026-10-28)", () => {
    const paths = ["עלייה לתורה/2.תפילה/a.jpg", "בוק/חוף/a.jpg", "עלייה לתורה/10.ריקודים/a.jpg", "עלייה לתורה/1.חתן/a.jpg", "עלייה לתורה/2.תפילה/b.jpg", "עלייה לתורה/3.אורחים/a.jpg", "a.jpg"];
    const order = tabsInOrder(paths.map((p) => dropTarget([], null, p))).map((t) => (t.parent && "name" in t.parent ? `${t.parent.name}/${t.name}` : t.name));
    expect(order).toEqual(["בוק/חוף", "עלייה לתורה/1.חתן", "עלייה לתורה/2.תפילה", "עלייה לתורה/3.אורחים", "עלייה לתורה/10.ריקודים"]);
  });

  it("orders flat folders by their numbers too, and joins the open event in that order", () => {
    const flat = tabsInOrder(["03 - חופה/a.jpg", "1.הכנות/a.jpg", "ריקודים/a.jpg"].map((p) => dropTarget([], null, p))).map((t) => t.name);
    expect(flat).toEqual(["1.הכנות", "03 - חופה", "ריקודים"]);
    const joined = tabsInOrder(["4.ברכות/a.jpg", "3.משפחה/a.jpg"].map((p) => dropTarget(folders, "aliyah", p)));
    expect(joined).toEqual([
      { kind: "tab", name: "3.משפחה", parent: { id: "aliyah" } },
      { kind: "tab", name: "4.ברכות", parent: { id: "aliyah" } },
    ]);
  });

  it("keeps tabs apart by their place, so both events can have a 1.אוירה", () => {
    expect(new Set([tabKey("1.אוירה", null), tabKey("1.אוירה", { id: "book" }), tabKey("1.אוירה", { name: "בוק" })]).size).toBe(3);
  });
});

describe("choosing tabs to share or download", () => {
  const all = new Set(folders.map((x) => x.id));
  it("checks a main tab with its sub-tabs, and unchecks them together", () => {
    const on = toggleTabKey(new Set(), folders, "book");
    expect([...on].sort()).toEqual(["beach", "book", "park"]);
    expect([...toggleTabKey(on, folders, "book")]).toEqual([]);
  });

  it("leaves the main tab out while only some of its sub-tabs are chosen", () => {
    const some = toggleTabKey(all, folders, "beach");
    expect(some.has("book")).toBe(false);
    expect(some.has("park")).toBe(true);
    expect(tabCheckState(some, folders, "book")).toBe("some");
    const back = toggleTabKey(some, folders, "beach");
    expect(back.has("book")).toBe(true);
    expect(tabCheckState(back, folders, "book")).toBe("on");
  });

  it("toggles a tab without sub-tabs on its own", () => {
    const flat = [f("a", "1.אוירה", 0), f("b", "2.חתן", 1)];
    expect([...toggleTabKey(new Set(["a", "b"]), flat, "a")]).toEqual(["b"]);
    expect(tabCheckState(new Set(), flat, "a")).toBe("off");
  });
});

describe("a new tab", () => {
  it("goes after the last of its siblings, also when the orders have gaps", () => {
    expect(nextSortOrder([f("a", "x", 0), f("b", "y", 2)], null)).toBe(3);
    expect(nextSortOrder(folders, "book")).toBe(2);
    expect(nextSortOrder(folders, "nothing")).toBe(0);
  });
});
