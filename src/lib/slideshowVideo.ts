// The gallery slideshow as a video file (owner, 2026-11-02: "כפתור ההורדה במצגת התמונות צריך להוריד
// את המצגת כקובץ mp4"). The same slides as on the screen (GallerySlideshow): each photo for 3
// seconds, whole on black, with its effect (Ken Burns, a fade, a slide, a turn or a circle). The
// frames are drawn on a canvas and encoded in the browser (lib/reels/encode.ts, WebCodecs).
//
// The pure part (which slide when, and where the photo is at that moment) is tested on its own; the
// CSS animations in GallerySlideshow use the same numbers.

import type { ShowPlan } from "@/lib/slideshow3d/plan";

export const SLIDE_SECONDS = 3;
export const ENTRANCE_SECONDS = 1.1;

export const SLIDE_EFFECTS = [
  "kenburns-in",
  "kenburns-out",
  "fade-punch",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "rotate-in",
  "circle-reveal",
] as const;
export type SlideEffect = (typeof SLIDE_EFFECTS)[number];

// A random effect per photo, picked once (the screen and the video use the same list).
export function randomEffects(
  count: number,
  random: () => number = Math.random,
): SlideEffect[] {
  return Array.from(
    { length: count },
    () => SLIDE_EFFECTS[Math.floor(random() * SLIDE_EFFECTS.length)],
  );
}

// CSS cubic-bezier(x1, y1, x2, y2) as a function of progress (0–1).
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) break;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Bisection when Newton wandered off.
    if (t < 0 || t > 1 || Math.abs(sampleX(t) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 40; i++) {
        if (sampleX(t) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sampleY(t);
  };
}

// The easings of GallerySlideshow's CSS: `ease-out` for Ken Burns, and the entrances' curve.
export const easeOut = cubicBezier(0, 0, 0.58, 1);
export const entranceEase = cubicBezier(0.22, 1, 0.36, 1);

// Where the photo is, `seconds` into its slide. dx/dy are shares of the photo's drawn size (CSS
// translate %), rotate in degrees, reveal the radius of the circle in CSS circle() percent (null =
// the whole photo).
export type SlidePose = {
  scale: number;
  dx: number;
  dy: number;
  rotate: number;
  opacity: number;
  reveal: number | null;
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function slidePose(effect: SlideEffect, seconds: number): SlidePose {
  const pose: SlidePose = {
    scale: 1,
    dx: 0,
    dy: 0,
    rotate: 0,
    opacity: 1,
    reveal: null,
  };
  if (effect === "kenburns-in" || effect === "kenburns-out") {
    const k = easeOut(Math.min(1, Math.max(0, seconds / SLIDE_SECONDS)));
    pose.scale = effect === "kenburns-in" ? lerp(1, 1.32, k) : lerp(1.32, 1, k);
    return pose;
  }
  const k = entranceEase(Math.min(1, Math.max(0, seconds / ENTRANCE_SECONDS)));
  switch (effect) {
    case "fade-punch":
      pose.opacity = k;
      pose.scale = lerp(0.88, 1, k);
      break;
    case "slide-left":
      pose.dx = lerp(0.22, 0, k);
      pose.opacity = k;
      break;
    case "slide-right":
      pose.dx = lerp(-0.22, 0, k);
      pose.opacity = k;
      break;
    case "slide-up":
      pose.dy = lerp(0.18, 0, k);
      pose.opacity = k;
      break;
    case "slide-down":
      pose.dy = lerp(-0.18, 0, k);
      pose.opacity = k;
      break;
    case "rotate-in":
      pose.opacity = k;
      pose.rotate = lerp(-9, 0, k);
      pose.scale = lerp(0.9, 1, k);
      break;
    case "circle-reveal":
      pose.reveal = lerp(0, 75, k);
      break;
  }
  return pose;
}

// Which photo is on at `t` seconds, and how far into its slide.
export function slideAt(
  t: number,
  count: number,
): { index: number; local: number } {
  if (count <= 0) return { index: 0, local: 0 };
  const index = Math.min(count - 1, Math.max(0, Math.floor(t / SLIDE_SECONDS)));
  return { index, local: Math.max(0, t - index * SLIDE_SECONDS) };
}

export function slideshowSeconds(count: number): number {
  return Math.max(0, count) * SLIDE_SECONDS;
}

// The photo whole inside the frame, centered (CSS max-width/max-height 100%, object-contain).
export function containRect(
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
): { x: number; y: number; w: number; h: number } {
  if (!(imgW > 0) || !(imgH > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const k = Math.min(frameW / imgW, frameH / imgH, Infinity);
  const w = imgW * k;
  const h = imgH * k;
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

// The video's size: Full HD on a computer, 720p on a phone (a long slideshow is held in memory
// while it's made, and a phone has less of it).
export function slideshowVideoSize(phone: boolean): {
  width: number;
  height: number;
  bitrate: number;
} {
  return phone
    ? { width: 1280, height: 720, bitrate: 2_500_000 }
    : { width: 1920, height: 1080, bitrate: 5_000_000 };
}

// The file's name: the gallery's name, without characters a file name can't have.
export function slideshowFileName(
  title: string | null | undefined,
  suffix: string,
  ext: "mp4" | "webm",
): string {
  const base = (title ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base ? `${base} - ` : ""}${suffix}.${ext}`;
}

// One frame: black, and the photo in its pose.
export function drawSlide(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  effect: SlideEffect,
  seconds: number,
  W: number,
  H: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  const box = containRect(iw, ih, W, H);
  if (!box.w || !box.h) return;
  const pose = slidePose(effect, seconds);
  if (pose.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, pose.opacity);
  ctx.translate(
    box.x + box.w / 2 + pose.dx * box.w,
    box.y + box.h / 2 + pose.dy * box.h,
  );
  if (pose.rotate) ctx.rotate((pose.rotate * Math.PI) / 180);
  if (pose.scale !== 1) ctx.scale(pose.scale, pose.scale);
  if (pose.reveal !== null) {
    // CSS circle(r%): r percent of the box's diagonal over √2.
    const r = (pose.reveal / 100) * (Math.hypot(box.w, box.h) / Math.SQRT2);
    if (r <= 0) {
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, -box.w / 2, -box.h / 2, box.w, box.h);
  ctx.restore();
}

export type SlideshowVideoFailure = "cancelled" | "unsupported" | "failed";
export class SlideshowVideoError extends Error {
  constructor(public reason: SlideshowVideoFailure) {
    super(reason);
  }
}

// Makes the video. `urls` must be on this site (a photo from another site would block the canvas):
// the photographer's /image route, or the client's /preview?inline=1. The photos load a few ahead,
// and only those stay in memory.
export async function exportSlideshowVideo(opts: {
  urls: string[];
  effects: SlideEffect[];
  phone: boolean;
  onProgress?: (fraction: number) => void;
  isCancelled?: () => boolean;
  // The 3D slideshow (admin only for now, lib/slideshow3d): `urls` are already in its random order,
  // and every frame is drawn by the same drawShowFrame as the screen.
  show?: ShowPlan | null;
}): Promise<Blob> {
  if (opts.show) return exportShowVideo({ ...opts, show: opts.show });
  const { exportReelMp4, ReelCancelledError, ReelUnsupportedError } =
    await import("@/lib/reels/encode");
  const size = slideshowVideoSize(opts.phone);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  const count = opts.urls.length;
  const loaded = new Map<number, Promise<HTMLImageElement | null>>();
  const load = (i: number) => {
    if (i < 0 || i >= count) return;
    if (loaded.has(i)) return;
    loaded.set(
      i,
      (async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const img = new Image();
            img.decoding = "async";
            img.src = opts.urls[i];
            await img.decode();
            return img;
          } catch {
            // Once more, then the slide stays black rather than stopping the whole video.
          }
        }
        return null;
      })(),
    );
  };
  let current: HTMLImageElement | null = null;
  let currentIndex = -1;
  try {
    return await exportReelMp4({
      canvas,
      total: slideshowSeconds(count),
      bitrate: size.bitrate,
      prepare: async (t) => {
        const { index } = slideAt(t, count);
        if (index === currentIndex) return;
        for (let i = index; i <= index + 2; i++) load(i);
        for (const k of [...loaded.keys()]) if (k < index) loaded.delete(k);
        current = (await loaded.get(index)) ?? null;
        currentIndex = index;
      },
      draw: (t) => {
        const { index, local } = slideAt(t, count);
        if (current)
          drawSlide(
            ctx,
            current,
            opts.effects[index] ?? "kenburns-in",
            local,
            size.width,
            size.height,
          );
        else {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, size.width, size.height);
        }
      },
      onProgress: opts.onProgress,
      isCancelled: opts.isCancelled,
    });
  } catch (e) {
    if (e instanceof ReelCancelledError)
      throw new SlideshowVideoError("cancelled");
    if (e instanceof ReelUnsupportedError)
      throw new SlideshowVideoError("unsupported");
    throw new SlideshowVideoError("failed");
  }
}


// The 3D slideshow as a video: the same timeline as the screen (3 seconds a photo, its transition
// in during the first 1.2), drawn frame by frame with drawShowFrame. The photo going off and the one
// coming on are both needed during a transition; the next two load ahead.
async function exportShowVideo(opts: {
  urls: string[];
  phone: boolean;
  onProgress?: (fraction: number) => void;
  isCancelled?: () => boolean;
  show: ShowPlan;
}): Promise<Blob> {
  const [{ exportReelMp4, ReelCancelledError, ReelUnsupportedError }, { drawShowFrame }, { loadFxImage }, { showMomentAt }] =
    await Promise.all([
      import("@/lib/reels/encode"),
      import("@/lib/slideshow3d/render"),
      import("@/lib/slideshow3d/images"),
      import("@/lib/slideshow3d/plan"),
    ]);
  type Img = Awaited<ReturnType<typeof loadFxImage>>;
  const size = slideshowVideoSize(opts.phone);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  const count = opts.urls.length;
  const plan = opts.show;
  const loaded = new Map<number, Promise<Img>>();
  const load = (i: number) => {
    if (i < 0 || i >= count || loaded.has(i)) return;
    // Same-site photos at their size: the video is drawn at full quality.
    loaded.set(i, loadFxImage(opts.urls[i], null));
  };
  let current: Img = null;
  let previous: Img = null;
  let currentIndex = -1;
  try {
    return await exportReelMp4({
      canvas,
      total: slideshowSeconds(count),
      bitrate: size.bitrate,
      prepare: async (t) => {
        const { index } = showMomentAt(t, count);
        if (index === currentIndex) return;
        for (let i = index - 1; i <= index + 2; i++) load(i);
        for (const k of [...loaded.keys()]) if (k < index - 1) loaded.delete(k);
        current = (await loaded.get(index)) ?? null;
        previous = index > 0 ? ((await loaded.get(index - 1)) ?? null) : null;
        currentIndex = index;
      },
      draw: (t) => {
        const m = showMomentAt(t, count);
        drawShowFrame(
          ctx,
          size.width,
          size.height,
          {
            incoming: { img: current, age: m.age, drift: plan.drifts[m.index] },
            outgoing: m.prev !== null ? { img: previous, age: m.prevAge, drift: plan.drifts[m.prev] } : null,
            transition: m.index === 0 ? null : (plan.transitions[m.index] ?? null),
            progress: m.progress,
          },
          "video",
        );
      },
      onProgress: opts.onProgress,
      isCancelled: opts.isCancelled,
    });
  } catch (e) {
    if (e instanceof ReelCancelledError) throw new SlideshowVideoError("cancelled");
    if (e instanceof ReelUnsupportedError) throw new SlideshowVideoError("unsupported");
    throw new SlideshowVideoError("failed");
  }
}
