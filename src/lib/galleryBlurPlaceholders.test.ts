import { describe, expect, it } from "vitest";
import { BLUR_KEEP_PER_FOLDER, BLUR_TRIM_FROM, trimBlurPlaceholders } from "@/lib/galleryBlurPlaceholders";

type P = { id: string; folder_id: string | null; sort_order: number; preview_blur_data_url: string | null };

const photos = (n: number, folderOf: (i: number) => string | null = () => null): P[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, folder_id: folderOf(i), sort_order: i, preview_blur_data_url: `data:image/webp;base64,${i}` }));

const withBlur = (list: P[]) => list.filter((p) => p.preview_blur_data_url !== null).map((p) => p.id);

describe("trimBlurPlaceholders", () => {
  it("leaves a gallery of up to 400 photos unchanged", () => {
    const list = photos(BLUR_TRIM_FROM);
    expect(trimBlurPlaceholders(list)).toBe(list);
    expect(withBlur(trimBlurPlaceholders(list))).toHaveLength(BLUR_TRIM_FROM);
  });

  it("above 400, keeps only the first 120 photos' placeholders", () => {
    const out = trimBlurPlaceholders(photos(BLUR_TRIM_FROM + 1));
    expect(out).toHaveLength(BLUR_TRIM_FROM + 1);
    expect(withBlur(out)).toEqual(Array.from({ length: BLUR_KEEP_PER_FOLDER }, (_, i) => `p${i}`));
  });

  it("keeps the first 120 of every tab, photos without a tab counting as one", () => {
    // 3 tabs of 200 interleaved, and 50 without a tab.
    const list = photos(650, (i) => (i >= 600 ? null : ["a", "b", "c"][i % 3]));
    const out = trimBlurPlaceholders(list);
    for (const folder of ["a", "b", "c", null]) {
      const kept = out.filter((p) => p.folder_id === folder && p.preview_blur_data_url !== null);
      const all = list.filter((p) => p.folder_id === folder);
      expect(kept.map((p) => p.id)).toEqual(all.slice(0, BLUR_KEEP_PER_FOLDER).map((p) => p.id));
    }
    expect(withBlur(out)).toHaveLength(3 * BLUR_KEEP_PER_FOLDER + 50);
  });

  it("goes by sort_order, not by the order the rows came in, and keeps the rows' order", () => {
    const list = photos(500).reverse();
    const out = trimBlurPlaceholders(list);
    expect(out.map((p) => p.id)).toEqual(list.map((p) => p.id));
    expect(new Set(withBlur(out))).toEqual(new Set(Array.from({ length: BLUR_KEEP_PER_FOLDER }, (_, i) => `p${i}`)));
  });

  it("changes nothing else on a photo, and doesn't touch the input", () => {
    const list = photos(450);
    const out = trimBlurPlaceholders(list);
    expect(list.every((p) => p.preview_blur_data_url !== null)).toBe(true);
    expect(out[200]).toEqual({ ...list[200], preview_blur_data_url: null });
    expect(out[0]).toBe(list[0]);
  });

  it("counts a photo with no placeholder toward its tab's 120", () => {
    const list = photos(450).map((p, i) => (i < 10 ? { ...p, preview_blur_data_url: null } : p));
    expect(withBlur(trimBlurPlaceholders(list))).toHaveLength(BLUR_KEEP_PER_FOLDER - 10);
  });
});
