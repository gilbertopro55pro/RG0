// The collage file (admin, 2026-10-23): print sizes, the pixels a size gets on this device, and the
// print resolution written into the JPEG, so a lab opening it sees the intended size in cm.

// Landscape print sizes in cm (the owner asked for the collage across), the common frame and canvas
// sizes. 60×40 is the default: 8 photos on a wall.
export const COLLAGE_SIZES: { w: number; h: number }[] = [
  { w: 30, h: 20 },
  { w: 40, h: 30 },
  { w: 45, h: 30 },
  { w: 50, h: 40 },
  { w: 60, h: 40 },
  { w: 70, h: 50 },
  { w: 90, h: 60 },
  { w: 100, h: 70 },
];
export const DEFAULT_COLLAGE_SIZE = { w: 60, h: 40 };
export const DEFAULT_COLLAGE_COUNT = 8;
export const COLLAGE_COUNT_RANGE = { min: 2, max: 30 };
export const COLLAGE_TARGET_DPI = 300;

// A browser draws at most so many pixels in one picture: an iPhone or Android canvas stops at about
// 16.7 million (4096×4096), a computer's Chrome goes much further (50 million keeps the memory sane).
export const MOBILE_MAX_PIXELS = 16_000_000;
export const DESKTOP_MAX_PIXELS = 50_000_000;

// The file's pixel size for a print size: 300 DPI when the device can draw that many pixels, less
// otherwise (the DPI it gets is shown, and printed into the file).
export function collagePixels(widthCm: number, heightCm: number, maxPixels: number): { width: number; height: number; dpi: number } {
  const wIn = widthCm / 2.54;
  const hIn = heightCm / 2.54;
  const fit = Math.sqrt(maxPixels / (wIn * hIn));
  const dpi = Math.max(1, Math.floor(Math.min(COLLAGE_TARGET_DPI, fit)));
  return { width: Math.round(wIn * dpi), height: Math.round(hIn * dpi), dpi };
}

// The JPEG a canvas makes starts with a JFIF header that says "no physical size". This writes the
// DPI into it (units = dots per inch, the same density both ways). A file without that header is
// returned as it was.
export function jpegWithDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const isJfif =
    bytes.length > 18 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[3] === 0xe0 &&
    bytes[6] === 0x4a && // J
    bytes[7] === 0x46 && // F
    bytes[8] === 0x49 && // I
    bytes[9] === 0x46 && // F
    bytes[10] === 0x00;
  if (!isJfif) return bytes;
  const out = new Uint8Array(bytes);
  const d = Math.max(1, Math.min(65535, Math.round(dpi)));
  out[13] = 1;
  out[14] = d >> 8;
  out[15] = d & 0xff;
  out[16] = d >> 8;
  out[17] = d & 0xff;
  return out;
}

// "קולאז' - <gallery>.jpg", without the characters a file name can't hold.
export function collageFileName(galleryTitle: string, prefix: string): string {
  const clean = galleryTitle.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${prefix}${clean ? ` - ${clean}` : ""}.jpg`;
}
