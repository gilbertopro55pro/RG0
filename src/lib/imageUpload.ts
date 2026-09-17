// Shared between the photographer's own gallery upload (GalleryManageView.tsx) and the
// client-facing upload widget (PublicGalleryView.tsx) — same allowed formats, same HEIC handling,
// so a photo a client uploads goes through the exact same validation/conversion pipeline as one
// the photographer uploads themselves.

export const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "bmp", "heic", "heif"];
// iPhones save photos as HEIC by default — an accept list of only "safe" web formats hides those
// photos from Safari's picker entirely (Files/Photos on iOS filters by this exact string), which
// looks like "nothing happens" when uploading from a phone. HEIC/HEIF files are converted to JPEG
// client-side before upload (see convertHeicIfNeeded) so nothing HEIC ever reaches storage.
const ALLOWED_EXTENSIONS_SET = new Set(ALLOWED_EXTENSIONS);
export const ALLOWED_ACCEPT = "image/jpeg,image/png,image/gif,image/bmp,image/heic,image/heif";

export function isAllowedImageFile(file: File): boolean {
  // Dot-prefixed names (macOS AppleDouble sidecars like "._IMG_1234.jpg", ".DS_Store") keep the
  // real file's extension, so the extension check alone lets them through — reject them here too.
  if (file.name.startsWith(".")) return false;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && ALLOWED_EXTENSIONS_SET.has(ext);
}

export function isHeicFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif";
}

export async function convertHeicIfNeeded(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(result) ? result[0] : result;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([blob], newName, { type: "image/jpeg" });
}

// XMLHttpRequest is the only browser upload API with a real progress event — `fetch`'s request
// body has no progress hook at all, so a PUT via fetch only ever reports "done" once the ENTIRE
// file has transferred. For a batch of large originals that reads as the progress bar jumping in
// coarse per-file steps and then sitting frozen for however long each individual file's own
// transfer takes — confirmed live 2026-09-03 as the actual cause of a "gets stuck every ~4%"
// report (with ~25 photos in the batch, 100/25 = 4% per file). This PUTs directly to an
// already-minted presigned URL (minting itself, and any retry-the-whole-thing logic, stays the
// caller's job) so the caller's progress bar can move continuously through each file's transfer.
export function putFileWithProgress(url: string, file: File, contentType: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`סטטוס ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("שגיאת רשת"));
    xhr.send(file);
  });
}
