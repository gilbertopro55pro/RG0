"use client";

// Shared between GalleryManageView.tsx's own export/upload flows and AlbumQuickAccessButton.tsx's
// home-screen quick-export shortcut — both need the exact same "actually get this file onto the
// user's device" logic, which is meaningfully more than a plain <a download> (see below).

// On iOS/Android tries the OS share sheet (Web Share API) so the user still gets a real "Save to
// Files"/"Save to device" target — plain <a download> isn't reliable on mobile browsers. Every
// other browser (every desktop one) just downloads straight to the Downloads folder, no picker,
// no extra click.
export async function downloadBlob(blob: Blob, filename: string, mimeType: string, allowSaveDialog = false): Promise<void> {
  const isMobileOs = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
  if (isMobileOs && nav.share) {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file] });
        return;
      }
    } catch (err) {
      // AbortError = user backed out of the share sheet on purpose — respect that, don't fall
      // back to a surprise auto-download. Any other error (unsupported file type, expired user
      // activation, etc.) falls through to the plain-download path below.
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }
  // Desktop browsers that support the File System Access API (Chrome/Edge — not Safari/Firefox)
  // can let the photographer pick exactly where the file is saved instead of always landing in
  // Downloads. Opt-in per call (see the PDF export's own use of this) rather than every download,
  // since a picker dialog is a meaningfully different — and slower — interaction than a silent
  // auto-download, and most exports don't need it.
  const win = window as unknown as { showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> };
  if (allowSaveDialog && !isMobileOs && win.showSaveFilePicker) {
    try {
      const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
      const handle = await win.showSaveFilePicker({
        suggestedName: filename,
        types: ext ? [{ description: mimeType, accept: { [mimeType]: [ext] } }] : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // AbortError = user cancelled the save dialog on purpose — respect that, same as the share
      // sheet above. Any other error falls through to the plain auto-download below.
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
