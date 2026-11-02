// Loading a photo for the 3D slideshow (browser only): decoded, made smaller when it's much bigger
// than it will ever be drawn (a phone doesn't keep a full-size photo per slide), and a tiny blurred
// copy for the background. No `ctx.filter` (Safari doesn't have it): the blur is the photo shrunk
// to a few pixels and stretched back with smoothing.

import type { FxImage } from "./effects";

const BLUR_SMALL = 20;
const BLUR_OUT = 80;

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function blurredCopy(el: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
  if (!(w > 0) || !(h > 0)) return null;
  const k = BLUR_SMALL / Math.max(w, h);
  const small = canvasOf(w * k, h * k);
  const sctx = small.getContext("2d");
  if (!sctx) return null;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(el, 0, 0, small.width, small.height);
  // Stretched in two steps: once to a few dozen pixels here, then to the screen when drawn. One
  // big step from a handful of pixels shows the grid.
  const k2 = BLUR_OUT / Math.max(w, h);
  const out = canvasOf(w * k2, h * k2);
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

async function decode(url: string): Promise<HTMLImageElement | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } catch {
      // Once more, then the slide shows its background only rather than stopping everything.
    }
  }
  return null;
}

// `fit`: the canvas size in pixels. Only a photo far bigger than it's ever drawn (2.5×) is redrawn
// smaller: the decoded <img> itself draws fastest (the browser keeps it ready at every size, a
// canvas copy gets resampled on every frame), and the slideshow's URLs are already sized.
export async function loadFxImage(url: string, fit: { W: number; H: number } | null): Promise<FxImage | null> {
  const img = await decode(url);
  if (!img) return null;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!(iw > 0) || !(ih > 0)) return null;
  let el: CanvasImageSource = img;
  let w = iw;
  let h = ih;
  if (fit) {
    const target = 1.25 * Math.min(fit.W / iw, fit.H / ih);
    if (target < 1 / 2.5) {
      const c = canvasOf(iw * target, ih * target);
      const cctx = c.getContext("2d");
      if (cctx) {
        cctx.imageSmoothingEnabled = true;
        cctx.imageSmoothingQuality = "high";
        cctx.drawImage(img, 0, 0, c.width, c.height);
        el = c;
        w = c.width;
        h = c.height;
      }
    }
  }
  return { el, w, h, bg: blurredCopy(el, w, h) };
}
