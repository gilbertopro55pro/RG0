// Colors from the event's invitation (magnet frames, stage 3, 2026-10-22): the photographer drops
// in the invitation, and the editor offers its colors and a one-click match (mat, text, ornaments).
// Pure functions over RGBA pixels, so they're tested without a browser (magnetPalette.test.ts).

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

// WCAG relative luminance and contrast ratio (1–21).
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// 0 (gray) – 1 (pure color), HSL saturation.
export function saturation([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

type Box = { pixels: Rgb[] };

function channelRange(pixels: Rgb[], c: 0 | 1 | 2): number {
  let min = 255;
  let max = 0;
  for (const p of pixels) {
    if (p[c] < min) min = p[c];
    if (p[c] > max) max = p[c];
  }
  return max - min;
}

function average(pixels: Rgb[]): Rgb {
  const sum = [0, 0, 0];
  for (const p of pixels) {
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  return [sum[0] / pixels.length, sum[1] / pixels.length, sum[2] / pixels.length];
}

// The image's main colors, most common first: median cut over the opaque pixels (deterministic,
// the same image always gives the same colors), then colors closer than `mergeDistance` (RGB
// distance) merged, so a gradient doesn't fill the palette with near-copies. `data` is RGBA, as
// from canvas getImageData; pass a downscaled image (a few hundred px), every pixel is counted.
export function extractPalette(data: Uint8ClampedArray | number[], count = 6, mergeDistance = 28): string[] {
  const pixels: Rgb[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [];

  // Split into more boxes than asked for, then merge: small accent colors survive this way.
  const target = count * 3;
  const boxes: Box[] = [{ pixels }];
  while (boxes.length < target) {
    let best = -1;
    let bestRange = 0;
    let bestChannel: 0 | 1 | 2 = 0;
    boxes.forEach((box, i) => {
      if (box.pixels.length < 2) return;
      for (const c of [0, 1, 2] as const) {
        const range = channelRange(box.pixels, c);
        if (range > bestRange) {
          bestRange = range;
          best = i;
          bestChannel = c;
        }
      }
    });
    if (best < 0 || bestRange < 8) break;
    const sorted = [...boxes[best].pixels].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = Math.floor(sorted.length / 2);
    boxes.splice(best, 1, { pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) });
  }

  const colors = boxes
    .filter((b) => b.pixels.length > 0)
    .map((b) => ({ rgb: average(b.pixels), n: b.pixels.length }))
    .sort((a, b) => b.n - a.n);
  const merged: { rgb: Rgb; n: number }[] = [];
  for (const c of colors) {
    const near = merged.find((m) => Math.hypot(m.rgb[0] - c.rgb[0], m.rgb[1] - c.rgb[1], m.rgb[2] - c.rgb[2]) < mergeDistance);
    if (near) {
      const n = near.n + c.n;
      near.rgb = [0, 1, 2].map((k) => (near.rgb[k] * near.n + c.rgb[k] * c.n) / n) as Rgb;
      near.n = n;
    } else {
      merged.push({ rgb: [...c.rgb] as Rgb, n: c.n });
    }
  }
  return merged
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((c) => rgbToHex(c.rgb));
}

// A match for the frame from the palette (most common first):
// - mat: the most common light color (the invitation's paper), else white;
// - text: the color with the best contrast against the mat (at least 4.5:1 when one exists);
// - accent (ornaments): the most saturated color that still shows on the mat (1.6:1: gold on cream
//   is a classic invitation accent and fine for an ornament, though too faint for text), else the text.
export function suggestFrameColors(palette: readonly string[]): { mat: string; text: string; accent: string } {
  const rgbs = palette.map(hexToRgb);
  const matRgb = rgbs.find((c) => luminance(c) > 0.6) ?? ([255, 255, 255] as Rgb);
  const mat = rgbToHex(matRgb);
  const others = rgbs.filter((c) => rgbToHex(c) !== mat);
  const byContrast = [...others].sort((a, b) => contrastRatio(b, matRgb) - contrastRatio(a, matRgb));
  const textRgb = byContrast[0] && contrastRatio(byContrast[0], matRgb) >= 3 ? byContrast[0] : ([46, 49, 66] as Rgb);
  const accentRgb =
    [...others].filter((c) => contrastRatio(c, matRgb) >= 1.6).sort((a, b) => saturation(b) - saturation(a))[0] ?? textRgb;
  return { mat, text: rgbToHex(textRgb), accent: rgbToHex(saturation(accentRgb) > 0.2 ? accentRgb : textRgb) };
}
