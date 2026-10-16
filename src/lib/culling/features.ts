// Photo culling (round 1): the raw measurements the engine takes of a region of a photo. Pure
// functions over a grayscale buffer, so they run the same in the browser, in a worker and in tests.
// Every one is stored per photo (culling_results.features), and the thresholds that turn them into
// "out of focus" are tuned afterwards against the owner's labels, without measuring again.

export type RegionStats = {
  w: number;
  h: number;
  // Variance of the Laplacian: the classic focus measure. Grows with contrast and with noise.
  lap: number;
  // Tenengrad: mean squared Sobel gradient. Same family, a little less noise-sensitive.
  ten: number;
  // Standard deviation of the pixels (contrast), to normalize the two above.
  std: number;
  // Noise sigma (Immerkær), so grain in low light isn't read as detail.
  noise: number;
  // Crété-Roffet blur effect, 0 (sharp) to 1 (blurred): compares the region with a re-blurred copy
  // of itself, so it barely depends on contrast. The same metric as skimage.measure.blur_effect.
  // Grain fools it (noise reads as detail): a blurred region with heavy grain scores as sharp.
  blur: number;
  // Laplacian variance and Tenengrad with the noise's own share taken out (white noise of sigma s
  // adds 20s² to the first and 24s² to the second with these kernels). Tested on a blurred image
  // with heavy grain: back to within ~5% of the clean blurred image.
  lapC: number;
  tenC: number;
  // Those two divided by the contrast (std²): the measure that holds up against both grain and a
  // low-contrast face. Tested: a sharp scene at 40% contrast keeps the same value, a blur of 2px
  // drops it ~100×, and the blurred image with grain stays as low as without.
  lapN: number;
  tenN: number;
};

// Luma, 0–255.
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}

export function stdDev(g: Float32Array): number {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < g.length; i++) {
    s += g[i];
    s2 += g[i] * g[i];
  }
  const m = s / g.length;
  return Math.sqrt(Math.max(0, s2 / g.length - m * m));
}

export function laplacianVar(g: Float32Array, w: number, h: number): number {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
      s += v;
      s2 += v * v;
      n++;
    }
  }
  if (!n) return 0;
  const m = s / n;
  return Math.max(0, s2 / n - m * m);
}

export function tenengrad(g: Float32Array, w: number, h: number): number {
  let s = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      s += gx * gx + gy * gy;
      n++;
    }
  }
  return n ? s / n : 0;
}

// Immerkær, "Fast Noise Variance Estimation" (1996): the mask cancels edges and smooth gradients
// and leaves the noise.
export function noiseSigma(g: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let s = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v =
        g[i - w - 1] - 2 * g[i - w] + g[i - w + 1] - 2 * g[i - 1] + 4 * g[i] - 2 * g[i + 1] + g[i + w - 1] - 2 * g[i + w] + g[i + w + 1];
      s += Math.abs(v);
    }
  }
  return (s * Math.sqrt(Math.PI / 2)) / (6 * (w - 2) * (h - 2));
}

// Crété-Roffet et al., "The Blur Effect" (2007), as skimage implements it (h_size 11, max over
// the two axes).
export function blurEffect(g: Float32Array, w: number, h: number, size = 11): number {
  const half = Math.floor(size / 2);
  if (w <= 2 * half + 2 || h <= 2 * half + 2) return 0;
  const axis = (horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const at = (line: number, k: number) => (horizontal ? g[line * w + k] : g[k * w + line]);
    const blurred = new Float32Array(len);
    let m1 = 0;
    let m2 = 0;
    for (let line = 0; line < lines; line++) {
      // Mean filter along the line, edges reflected (as scipy's uniform_filter1d).
      for (let k = 0; k < len; k++) {
        let s = 0;
        for (let d = -half; d <= half; d++) {
          let j = k + d;
          if (j < 0) j = -j - 1;
          else if (j >= len) j = 2 * len - j - 1;
          s += at(line, j);
        }
        blurred[k] = s / size;
      }
      if (line < half || line >= lines - half) continue;
      for (let k = half; k < len - half - 1; k++) {
        const sv = Math.abs(at(line, k + 1) - at(line, k));
        const tv = Math.max(0, sv - Math.abs(blurred[k + 1] - blurred[k]));
        m1 += sv;
        m2 += tv;
      }
    }
    return m1 > 0 ? Math.abs(m1 - m2) / m1 : 1;
  };
  return Math.max(axis(true), axis(false));
}

const round = (v: number) => (v === 0 || !Number.isFinite(v) ? 0 : Number(v.toPrecision(4)));

export function regionStats(g: Float32Array, w: number, h: number): RegionStats {
  const lap = laplacianVar(g, w, h);
  const ten = tenengrad(g, w, h);
  const noise = noiseSigma(g, w, h);
  const std = stdDev(g);
  const lapC = Math.max(0, lap - 20 * noise * noise);
  const tenC = Math.max(0, ten - 24 * noise * noise);
  return {
    w,
    h,
    lap: round(lap),
    ten: round(ten),
    std: round(std),
    noise: round(noise),
    blur: round(blurEffect(g, w, h)),
    lapC: round(lapC),
    tenC: round(tenC),
    lapN: round(lapC / (std * std + 1)),
    tenN: round(tenC / (std * std + 1)),
  };
}

// The scene without faces: the photo split into a grid, each cell's gradient energy. The sharpest
// cells say whether anything in the photo is in focus (a detail shot, a dress, a ring).
export type TileStats = { cols: number; rows: number; ten: number[]; std: number[] };

export function tileStats(g: Float32Array, w: number, h: number, cols = 8, rows = 8): TileStats {
  const ten: number[] = [];
  const std: number[] = [];
  const tw = Math.floor(w / cols);
  const th = Math.floor(h / rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = new Float32Array(tw * th);
      for (let y = 0; y < th; y++) t.set(g.subarray((r * th + y) * w + c * tw, (r * th + y) * w + c * tw + tw), y * tw);
      ten.push(round(tenengrad(t, tw, th)));
      std.push(round(stdDev(t)));
    }
  }
  return { cols, rows, ten, std };
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
}

// Eye aspect ratio (Soukupová & Čech 2016) from six points around one eye: corner, two upper lid
// points, corner, two lower lid points. About 0.3 open, under ~0.15 closed.
export function eyeAspectRatio(p: [number, number][]): number {
  const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const width = d(p[0], p[3]);
  return width > 0 ? round((d(p[1], p[5]) + d(p[2], p[4])) / (2 * width)) : 0;
}
