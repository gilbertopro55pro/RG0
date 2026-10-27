// The client's album view (GalleryAlbumProofing) shows one page at a time. To make the next page
// appear at once, the photos of the pages around the one on screen load ahead, in the background:
// the next two, the one before, and the last page, where "לעמוד האחרון" jumps. Not the whole
// album: 20 pages of photos is too much on a phone's data plan.

type PreloadSpread = {
  layout: string;
  photo1: { url: string };
  photo2: { url: string } | null;
  elements: { type: string; url?: string }[];
  background: { url: string } | null;
};

// The photos a page draws: its frames (a designed page) or its one or two photos (an older page),
// and its blurred background.
export function spreadImageUrls(spread: PreloadSpread): string[] {
  const urls =
    spread.layout === "custom"
      ? spread.elements.flatMap((el) => (el.type === "photo" && el.url ? [el.url] : []))
      : [spread.photo1.url, ...(spread.photo2 ? [spread.photo2.url] : [])];
  if (spread.background) urls.push(spread.background.url);
  return [...new Set(urls)];
}

// The pages to load ahead while page `index` is on screen, nearest first.
export function pagesToPreload(index: number, count: number): number[] {
  const pages: number[] = [];
  for (const i of [index + 1, index + 2, index - 1, count - 1]) {
    if (i >= 0 && i < count && i !== index && !pages.includes(i)) pages.push(i);
  }
  return pages;
}
