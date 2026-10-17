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

// A dropped file, read lazily (owner, 2026-10-17: a folder dragged into a gallery in Safari failed
// on every photo). The File is taken from its entry only when the upload gets to it, so a drop of
// thousands of photos doesn't hold thousands of open files, and a file that changed after the drop
// (a cloud folder downloading it) is read as it is now. `file` is set when there's no entry.
export type DroppedEntry = { name: string; relativePath: string; entry?: FileSystemFileEntry; file?: File };

async function readEntryTree(entry: FileSystemEntry, path: string): Promise<DroppedEntry[]> {
  if (isHiddenFileName(entry.name)) return [];
  if (entry.isFile) return [{ name: entry.name, relativePath: `${path}${entry.name}`, entry: entry as FileSystemFileEntry }];
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const all: FileSystemEntry[] = [];
  // readEntries returns a batch at a time (100 in Chrome) until an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    all.push(...batch);
  }
  const nested = await Promise.all(all.map((e) => readEntryTree(e, `${path}${entry.name}/`)));
  return nested.flat();
}

export async function readDroppedEntries(items: DataTransferItemList): Promise<DroppedEntry[]> {
  // Both are read now, while the drop event still holds them.
  const list = Array.from(items).filter((item) => item.kind === "file");
  const roots = list.map((item) => ({ entry: item.webkitGetAsEntry?.() ?? null, file: item.getAsFile() }));
  const results = await Promise.all(
    roots.map(({ entry, file }) =>
      entry ? readEntryTree(entry, "") : Promise.resolve(file && !isHiddenFileName(file.name) ? [{ name: file.name, relativePath: file.name, file }] : [])
    )
  );
  return results.flat();
}

// The File behind a dropped entry, read now.
export function fileOfEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}
