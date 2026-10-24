// The blurred placeholder (preview_blur_data_url, ~500 bytes of inline image each) shows behind a
// thumbnail until its preview loads. In a big gallery they were most of the page: 2.7 MB for the
// 5,382-photo gallery, sent to the phone for photos far below the first screen (2026-10-24). Above
// BLUR_TRIM_FROM photos, only the first BLUR_KEEP_PER_FOLDER of every tab keep theirs (photos
// without a tab count as one tab), in the gallery's order: what shows first in each tab. The rest
// get the tile's plain background until the preview arrives. Smaller galleries are unchanged.
export const BLUR_TRIM_FROM = 400;
export const BLUR_KEEP_PER_FOLDER = 120;

type BlurPhoto = { folder_id: string | null; sort_order: number; preview_blur_data_url: string | null };

export function trimBlurPlaceholders<T extends BlurPhoto>(photos: T[]): T[] {
  if (photos.length <= BLUR_TRIM_FROM) return photos;
  // The gallery's order; equal sort_order keeps the order the rows came in.
  const order = photos.map((_, i) => i).sort((a, b) => photos[a].sort_order - photos[b].sort_order || a - b);
  const perFolder = new Map<string | null, number>();
  const keep = new Set<number>();
  for (const i of order) {
    const folder = photos[i].folder_id;
    const seen = perFolder.get(folder) ?? 0;
    if (seen < BLUR_KEEP_PER_FOLDER) keep.add(i);
    perFolder.set(folder, seen + 1);
  }
  return photos.map((p, i) => (keep.has(i) || p.preview_blur_data_url === null ? p : { ...p, preview_blur_data_url: null }));
}
