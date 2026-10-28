import { tabKey, type DropTarget, type GalleryFolderLike } from "@/lib/galleryFolders";

// The client's get-or-create of a tab when it uploads a folder (api/gallery/[token]/ensure-folder,
// PublicGalleryView). A tab is found by its place: a main tab by its name, a sub-tab by its name
// under a main tab, given by id (the open event) or by name (the dropped top folder).

export type EnsureFolderRequest = { name: string; parent: null | { id: string } | { name: string } };

const MAX_NAME = 120;

export function parseEnsureFolderBody(body: unknown): EnsureFolderRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { folderName?: unknown; parentId?: unknown; parentName?: unknown };
  const name = typeof b.folderName === "string" ? b.folderName.trim().slice(0, MAX_NAME) : "";
  if (!name) return null;
  if (typeof b.parentId === "string" && b.parentId.trim()) return { name, parent: { id: b.parentId.trim() } };
  if (typeof b.parentName === "string" && b.parentName.trim()) return { name, parent: { name: b.parentName.trim().slice(0, MAX_NAME) } };
  return { name, parent: null };
}

// The body the client sends for a drop target (lib/galleryFolders.ts dropTarget).
export function ensureFolderBody(target: Extract<DropTarget, { kind: "tab" }>): { folderName: string; parentId?: string; parentName?: string } {
  if (!target.parent) return { folderName: target.name };
  return "id" in target.parent ? { folderName: target.name, parentId: target.parent.id } : { folderName: target.name, parentName: target.parent.name };
}

// Every tab the gallery already has, by every way a drop can ask for it.
export function tabCache(folders: readonly GalleryFolderLike[]): Map<string, string> {
  const cache = new Map<string, string>();
  for (const f of folders) {
    const parent = f.parent_id ? folders.find((p) => p.id === f.parent_id) : null;
    if (!parent) {
      cache.set(tabKey(f.name, null), f.id);
      continue;
    }
    cache.set(tabKey(f.name, { id: parent.id }), f.id);
    cache.set(tabKey(f.name, { name: parent.name }), f.id);
  }
  return cache;
}
