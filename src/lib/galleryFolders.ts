// Main tabs and sub-tabs in a gallery (owner, 2026-10-28; migration 0203). One gallery can hold two
// events: a "בוק בר מצווה" main tab with its locations as sub-tabs, and an "עלייה לתורה" main tab
// with "1.אוירה", "2.חתן"… under it. Two levels only. A gallery with one level of tabs works as
// before: every tab is a main tab without sub-tabs.

import type { GalleryFolderRow } from "@/lib/types";

export type GalleryFolderLike = { id: string; name: string; sort_order: number; parent_id?: string | null };

// A gallery_folders row with its main tab. Kept out of GalleryFolderRow (lib/types.ts is part of
// the PDF worker's build, and a change there redeploys it).
export type GalleryFolderNode = GalleryFolderRow & { parent_id?: string | null };

export type FolderTreeNode<F extends GalleryFolderLike> = { folder: F; children: F[] };

const bySortOrder = <F extends GalleryFolderLike>(a: F, b: F) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

// The main tabs in order, each with its sub-tabs in order. A sub-tab whose main tab isn't in the
// list (a share link that kept only it) stands as a main tab of its own.
export function folderTree<F extends GalleryFolderLike>(folders: readonly F[]): FolderTreeNode<F>[] {
  const ids = new Set(folders.map((f) => f.id));
  const isMain = (f: F) => !f.parent_id || !ids.has(f.parent_id);
  return folders
    .filter(isMain)
    .sort(bySortOrder)
    .map((folder) => ({ folder, children: folders.filter((f) => !isMain(f) && f.parent_id === folder.id).sort(bySortOrder) }));
}

// Every tab in reading order: each main tab, then its sub-tabs. Code that reads the tabs as one list
// (the album, the collage, the cover rotation) follows the gallery's order this way.
export function orderedFolders<F extends GalleryFolderLike>(folders: readonly F[]): F[] {
  return folderTree(folders).flatMap((n) => [n.folder, ...n.children]);
}

// The tab and the sub-tabs under it: what opening a main tab shows.
export function folderWithChildren(folders: readonly GalleryFolderLike[], id: string): Set<string> {
  return new Set([id, ...folders.filter((f) => f.parent_id === id).map((f) => f.id)]);
}

// The chosen tabs with the sub-tabs of every chosen main tab: choosing "בוק" in a share or a
// download chooses its locations too. Other keys (the "no tab" key) are kept as they are.
export function expandFolderKeys(keys: Iterable<string>, folders: readonly GalleryFolderLike[]): string[] {
  const out = new Set(keys);
  for (const f of folders) if (f.parent_id && out.has(f.parent_id)) out.add(f.id);
  return [...out];
}

// The main tab a tab belongs to: its parent, or itself.
export function mainFolderId(folders: readonly GalleryFolderLike[], id: string | null): string | null {
  if (!id) return null;
  const f = folders.find((x) => x.id === id);
  if (!f) return null;
  return f.parent_id && folders.some((x) => x.id === f.parent_id) ? f.parent_id : f.id;
}

// "בוק › חוף" for a sub-tab, the name alone for a main tab. For lists that show every tab in one
// column (download, the album's photo panel).
type NamedFolder = { id: string; name: string; parent_id?: string | null };
export function folderLabel(folders: readonly NamedFolder[], folder: NamedFolder, sep = " › "): string {
  const parent = folder.parent_id ? folders.find((f) => f.id === folder.parent_id) : null;
  return parent ? `${parent.name}${sep}${folder.name}` : folder.name;
}

// The client sees one row of tabs when the gallery is one event in a main tab of its own: the
// sub-tabs of that lone main tab, as a gallery with one level of tabs always looked.
export function lonelyMain<F extends GalleryFolderLike>(tree: readonly FolderTreeNode<F>[]): FolderTreeNode<F> | null {
  return tree.length === 1 && tree[0].children.length > 0 ? tree[0] : null;
}

// The tabs a dropped file asks for, from its path inside what was dropped (owner, 2026-10-28): the
// top folder is the main tab, and the folder that holds the file is its sub-tab.
// "בוק/חוף/1.jpg" → בוק › חוף, "1.אוירה/1.jpg" → 1.אוירה, "a/b/c/1.jpg" → a › c, "1.jpg" → none.
export function tabPathFromRelPath(relativePath: string): { main: string; sub: string | null } | null {
  const parts = relativePath.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return null;
  const dirs = parts.slice(0, -1);
  return { main: dirs[0], sub: dirs.length > 1 ? dirs[dirs.length - 1] : null };
}

// Where a dropped file goes when a tab is open. A folder of its own ("6.ריקודים/1.jpg") joins the
// open event as a sub-tab when that event already has sub-tabs; otherwise it's a tab of its own,
// as before (owner, 2026-10-17: a dropped folder opens a tab named after it). Deeper folders bring
// their own main tab. A loose file goes to the open tab.
export type DropTarget =
  | { kind: "open"; folderId: string | null }
  | { kind: "tab"; name: string; parent: null | { id: string } | { name: string } };

export function dropTarget(folders: readonly GalleryFolderLike[], activeFolderId: string | null, relativePath: string): DropTarget {
  const path = tabPathFromRelPath(relativePath);
  if (!path) return { kind: "open", folderId: activeFolderId };
  if (path.sub) return { kind: "tab", name: path.sub, parent: { name: path.main } };
  const main = mainFolderId(folders, activeFolderId);
  const eventWithSubTabs = !!main && folders.some((f) => f.parent_id === main);
  return { kind: "tab", name: path.main, parent: eventWithSubTabs && main ? { id: main } : null };
}

export type TabTarget = Extract<DropTarget, { kind: "tab" }>;

// The tabs a drop opens, each once, in the order of their names: a new tab goes after its last
// sibling, so the order they're made in is the order they show. Made in the order the browser
// read the files, "2.תפילה" came before "1.חתן" (owner, 2026-10-28). Numbers count as numbers:
// "10.ריקודים" after "9.ברכות".
const naturalOrder = new Intl.Collator("he", { numeric: true });
export function tabsInOrder(targets: readonly DropTarget[]): TabTarget[] {
  const place = (t: TabTarget) => (!t.parent ? [t.name] : "id" in t.parent ? [`#${t.parent.id}`, t.name] : [t.parent.name, t.name]);
  const unique = new Map<string, TabTarget>();
  for (const t of targets) if (t.kind === "tab") unique.set(tabKey(t.name, t.parent), t);
  return [...unique.values()].sort((a, b) => {
    const pa = place(a);
    const pb = place(b);
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      const c = naturalOrder.compare(pa[i], pb[i]);
      if (c) return c;
    }
    return pa.length - pb.length;
  });
}

// A cache key for a tab by its place: "<parent id or name>/<name>". Main tabs: "/<name>".
export function tabKey(name: string, parent: null | { id: string } | { name: string }): string {
  if (!parent) return `/${name}`;
  return "id" in parent ? `#${parent.id}/${name}` : `@${parent.name}/${name}`;
}

// The folder inside a zip for a tab: "בוק/חוף" for a sub-tab, so the download keeps the structure.
export function zipFolderSegments(folders: readonly GalleryFolderLike[], folderId: string): string[] {
  const f = folders.find((x) => x.id === folderId);
  if (!f) return [];
  const parent = f.parent_id ? folders.find((x) => x.id === f.parent_id) : null;
  return parent ? [parent.name, f.name] : [f.name];
}

// Choosing tabs in a share or a download picker. Keys are explicit (a main tab's id also stands for
// its own photos): checking a main tab checks it and its sub-tabs; checking a sub-tab checks only
// it. The main tab's own id stays chosen only while all its sub-tabs are, so a share of some
// locations doesn't bring the main tab's other photos.
export function toggleTabKey(selected: ReadonlySet<string>, folders: readonly GalleryFolderLike[], id: string): Set<string> {
  const next = new Set(selected);
  const f = folders.find((x) => x.id === id);
  const children = folders.filter((x) => x.parent_id === id).map((x) => x.id);
  if (!f || (!f.parent_id && children.length === 0) || (f.parent_id && !folders.some((x) => x.id === f.parent_id))) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }
  if (!f.parent_id) {
    const all = [id, ...children];
    const on = all.every((k) => next.has(k));
    for (const k of all) {
      if (on) next.delete(k);
      else next.add(k);
    }
    return next;
  }
  if (next.has(id)) next.delete(id);
  else next.add(id);
  const siblings = folders.filter((x) => x.parent_id === f.parent_id).map((x) => x.id);
  if (siblings.every((k) => next.has(k))) next.add(f.parent_id);
  else next.delete(f.parent_id);
  return next;
}

// How a tab's checkbox shows: a main tab is "some" while only some of its sub-tabs are chosen.
export function tabCheckState(selected: ReadonlySet<string>, folders: readonly GalleryFolderLike[], id: string): "on" | "off" | "some" {
  if (selected.has(id)) return "on";
  const children = folders.filter((x) => x.parent_id === id);
  return children.some((c) => selected.has(c.id)) ? "some" : "off";
}

// The place of a new tab among its siblings: after the last one. A count isn't enough, since the
// orders have gaps once a tab was deleted or moved.
export function nextSortOrder(folders: readonly GalleryFolderLike[], parentId: string | null): number {
  const siblings = folders.filter((f) => (f.parent_id ?? null) === parentId);
  return siblings.length ? Math.max(...siblings.map((f) => f.sort_order)) + 1 : 0;
}
