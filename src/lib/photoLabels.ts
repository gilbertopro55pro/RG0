// The label a client puts on a photo with the diamond in their gallery ("קנבס", "בלוק זכוכית"), to
// tell the photographer what to do with it. One label per photo (gallery_photos.custom_label).
//
// Owner, 2026-11-04: the diamond has to be there on a computer as well as on a phone, and using it
// once must not be the end of it. The client reopens it to change or remove a label, and the labels
// already used in the gallery are offered again, so the same label goes on photo after photo with
// one tap instead of being typed each time.

export const PHOTO_LABEL_MAX = 40;

/** What gets saved: spaces collapsed, at most PHOTO_LABEL_MAX characters, empty means no label. */
export function normalizePhotoLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const label = input.replace(/\s+/g, " ").trim().slice(0, PHOTO_LABEL_MAX).trim();
  return label || null;
}

/** Every label used in the gallery, once each, in a stable order (the filter chips, the quick picks). */
export function labelsInUse(photos: readonly { custom_label: string | null }[]): string[] {
  const seen = new Set<string>();
  for (const photo of photos) {
    const label = normalizePhotoLabel(photo.custom_label);
    if (label) seen.add(label);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "he"));
}
