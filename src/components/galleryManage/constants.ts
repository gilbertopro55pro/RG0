export const CLOSE_ANIMATION_MS = 220;

export const ZIP_NO_FOLDER_KEY = "none";

// A gallery this size (thousands of un-virtualized DOM nodes, a single-tab sequential upload
// session that can run for hours) is already pushing the browser tab's limits — capping it keeps
// a runaway selection (an entire multi-day event's raw folder, say) from silently degrading into
// a stalled or crashed upload with no resumable progress.
export const MAX_GALLERY_PHOTOS = 8000;

// Common photo-album print sizes, each with a recommended safe-margin starting point — picking
// one just prefills the width/height/margin fields below, so manual entry (typing different
// numbers, or overriding a preset's values) always stays available on the exact same fields.
export const ALBUM_SIZE_PRESETS: { label: string; width: number; height: number; margin: number }[] = [
  { label: "20×20", width: 20, height: 20, margin: 0.4 },
  { label: "20×30", width: 20, height: 30, margin: 0.5 },
  { label: "30×20", width: 30, height: 20, margin: 0.5 },
  { label: "25×25", width: 25, height: 25, margin: 0.5 },
  { label: "30×30", width: 30, height: 30, margin: 0.6 },
  { label: "30×40", width: 30, height: 40, margin: 0.8 },
  { label: "40×30", width: 40, height: 30, margin: 0.8 },
  { label: "54×20", width: 54, height: 20, margin: 0.6 },
  { label: "60×30", width: 60, height: 30, margin: 0.9 },
  { label: "80×30", width: 80, height: 30, margin: 1 },
];

export const CELL_SIZE_MIN = 80;
export const CELL_SIZE_MAX = 260;
export const CELL_SIZE_DEFAULT = 126;
