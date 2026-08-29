export type DroppedFile = { file: File; relativePath: string };

// macOS writes hidden sidecar files (AppleDouble "._name.jpg", ".DS_Store", etc.) into any
// folder it touches — copying to/from a non-HFS+ volume, zipping, or a network share is enough
// to spawn one per real file. They pass any extension-based filter (the sidecar keeps the
// original's extension) but aren't decodable image data, so they'd upload as broken, uncounted-
// looking "photos" that still occupy a real gallery_photos row. Skip anything dot-prefixed here,
// before it ever reaches the upload queue, rather than filtering it out cosmetically later.
export function isHiddenFileName(name: string): boolean {
  return name.startsWith(".");
}

async function readEntryFiles(entry: FileSystemEntry, path: string): Promise<DroppedFile[]> {
  if (isHiddenFileName(entry.name)) return [];
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    );
    return [{ file, relativePath: `${path}${entry.name}` }];
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries: FileSystemEntry[] = await new Promise((resolve, reject) => {
      const all: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve(all);
            return;
          }
          all.push(...batch);
          readBatch();
        }, reject);
      };
      readBatch();
    });
    const nested = await Promise.all(entries.map((e) => readEntryFiles(e, `${path}${entry.name}/`)));
    return nested.flat();
  }
  return [];
}

// Reads a drop event's DataTransferItemList, recursing into any dropped folders while
// preserving the relative path (e.g. "1.אווירה/photo.jpg") so callers can tell which
// folder each file came from.
export async function readDataTransferItems(items: DataTransferItemList): Promise<DroppedFile[]> {
  const entries = Array.from(items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  const results = await Promise.all(entries.map((e) => readEntryFiles(e, "")));
  return results.flat();
}

// A file's folder tab is whatever directory directly contains it — works the same whether
// the photographer dropped one folder, several sibling folders, or a parent wrapping folder
// full of subfolders, since only the immediate parent segment matters.
export function folderNameFromPath(relativePath: string): string | null {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  return parts[parts.length - 2];
}
