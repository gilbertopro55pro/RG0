import type { ReelSettings, ReelTemplate } from "./templates";

// The reel's frame at time t, drawn from scratch every time (a pure function of t), so the live
// preview and the exported MP4 are the same frames. Every size is relative to the canvas, so the
// small preview canvas and the full 1080-wide export look identical.

export type ReelImage = { el: CanvasImageSource; width: number; height: number };

export type ReelFonts = { serif: string; sans: string };

export type ReelTimeline = {
  segments: number;
  per: number; // seconds per segment
  transition: number;
  tail: number; // extra hold at the end for the ending text
  total: number;
};

const TAIL_SECONDS = 1.8;

export function reelTimeline(photoCount: number, tpl: ReelTemplate, settings: ReelSettings): ReelTimeline {
  const segments = Math.max(1, tpl.frame === "split" ? Math.ceil(photoCount / 2) : photoCount);
  const per = tpl.photoSeconds * settings.speed;
  const transition = Math.min(tpl.transitionSeconds * settings.speed, per * 0.45);
  const tail = settings.text.show && settings.text.ending.trim() ? TAIL_SECONDS : 0;
  return { segments, per, transition, tail, total: segments * per + tail };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (v: number) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);
const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);

type Rect = { x: number; y: number; w: number; h: number };

// The photo covering `r`, moved by the template's motion at progress p (0-1 through its segment).
function drawCover(ctx: CanvasRenderingContext2D, img: ReelImage, r: Rect, p: number, motion: ReelTemplate["motion"], index: number) {
  const dir = index % 2 === 0 ? 1 : -1;
  let s = 1;
  let dx = 0;
  if (motion === "kenburns") {
    s = dir > 0 ? 1.04 + 0.1 * p : 1.14 - 0.1 * p;
    dx = dir * 0.03 * p * r.w;
  } else if (motion === "punch") {
    s = 1.18 - 0.16 * easeOut(clamp01(p * 3));
  } else if (motion === "pan") {
    s = 1.16;
    dx = dir * (p - 0.5) * 0.1 * r.w;
  } else {
    s = 1.03 + 0.04 * p;
  }
  const base = Math.max(r.w / img.width, r.h / img.height) * s;
  const dw = img.width * base;
  const dh = img.height * base;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.drawImage(img.el, r.x + (r.w - dw) / 2 + dx, r.y + (r.h - dh) / 2, dw, dh);
  ctx.restore();
}

// A small, blurred and darkened copy of a photo for backgrounds, made once per photo.
const blurCache = new WeakMap<object, ReelImage>();
function blurredCopy(img: ReelImage): ReelImage {
  const hit = blurCache.get(img.el as object);
  if (hit) return hit;
  const w = 180;
  const h = Math.max(1, Math.round((w * img.height) / img.width));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (typeof g.filter === "string") g.filter = "blur(5px) brightness(0.72)";
  g.drawImage(img.el, -8, -8, w + 16, h + 16);
  if (typeof g.filter !== "string") {
    g.fillStyle = "rgba(0,0,0,0.4)";
    g.fillRect(0, 0, w, h);
  }
  const out = { el: c, width: w, height: h };
  blurCache.set(img.el as object, out);
  return out;
}

// One segment's picture (a photo, a framed photo, or two photos stacked) filling the canvas.
function drawSegment(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, p: number, tpl: ReelTemplate, images: ReelImage[]) {
  if (tpl.frame === "split") {
    const a = images[(2 * k) % images.length];
    const b = images[2 * k + 1];
    if (!b) {
      drawCover(ctx, a, { x: 0, y: 0, w: W, h: H }, p, tpl.motion, k);
      return;
    }
    const gap = Math.round(W * 0.012);
    const half = (H - gap) / 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    drawCover(ctx, a, { x: 0, y: 0, w: W, h: half }, p, tpl.motion, 2 * k);
    drawCover(ctx, b, { x: 0, y: half + gap, w: W, h: half }, p, tpl.motion, 2 * k + 1);
    return;
  }
  const img = images[k % images.length];
  if (tpl.frame === "framed") {
    // A blurred, darkened copy as the background (blurred once per photo, small, then scaled up —
    // blurring the full frame every frame made this template several times slower to export);
    // the photo in a white frame over it.
    drawCover(ctx, blurredCopy(img), { x: 0, y: 0, w: W, h: H }, 0.5, "drift", k);
    const maxW = W * 0.82;
    const maxH = H * 0.6;
    const fit = Math.min(maxW / img.width, maxH / img.height);
    const fw = img.width * fit;
    const fh = img.height * fit;
    const fx = (W - fw) / 2;
    const fy = (H - fh) / 2 - H * 0.04;
    const border = Math.round(W * 0.016);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = W * 0.04;
    ctx.shadowOffsetY = W * 0.012;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(fx - border, fy - border, fw + 2 * border, fh + 2 * border);
    ctx.restore();
    drawCover(ctx, img, { x: fx, y: fy, w: fw, h: fh }, p, "drift", k);
    return;
  }
  drawCover(ctx, img, { x: 0, y: 0, w: W, h: H }, p, tpl.motion, k);
}

let grainTile: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d")!;
  const data = g.createImageData(160, 160);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  grainTile = c;
  return c;
}

const HEBREW = /[֐-׿]/;

// Lines of `text` no wider than maxW at the current font.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

type TextLook = { titleFont: string; titleSize: number; subFont: string; subSize: number; boxed: boolean; line: boolean; shadow: boolean };

function textLook(style: ReelTemplate["textStyle"], fonts: ReelFonts, W: number): TextLook {
  switch (style) {
    case "bold":
      return { titleFont: `800 ${W * 0.105}px ${fonts.sans}`, titleSize: W * 0.105, subFont: `600 ${W * 0.04}px ${fonts.sans}`, subSize: W * 0.04, boxed: false, line: false, shadow: true };
    case "cinema":
      return { titleFont: `400 ${W * 0.075}px ${fonts.serif}`, titleSize: W * 0.075, subFont: `400 ${W * 0.032}px ${fonts.sans}`, subSize: W * 0.032, boxed: false, line: true, shadow: true };
    case "magazine":
      return { titleFont: `500 ${W * 0.07}px ${fonts.serif}`, titleSize: W * 0.07, subFont: `500 ${W * 0.032}px ${fonts.sans}`, subSize: W * 0.032, boxed: true, line: false, shadow: false };
    case "modern":
      return { titleFont: `600 ${W * 0.08}px ${fonts.sans}`, titleSize: W * 0.08, subFont: `400 ${W * 0.034}px ${fonts.sans}`, subSize: W * 0.034, boxed: false, line: true, shadow: true };
    default:
      return { titleFont: `400 ${W * 0.09}px ${fonts.serif}`, titleSize: W * 0.09, subFont: `400 ${W * 0.034}px ${fonts.sans}`, subSize: W * 0.034, boxed: false, line: true, shadow: true };
  }
}

// A block of text (title + optional subtitle) centred at y, faded/raised by `a` (0-1).
function drawTextBlock(ctx: CanvasRenderingContext2D, W: number, H: number, title: string, subtitle: string, y: number, a: number, look: TextLook, color: string) {
  if (a <= 0 || (!title.trim() && !subtitle.trim())) return;
  const maxW = W * 0.84;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = HEBREW.test(title + subtitle) ? "rtl" : "ltr";
  ctx.font = look.titleFont;
  const tLines = title.trim() ? wrap(ctx, title.trim(), maxW) : [];
  ctx.font = look.subFont;
  const sLines = subtitle.trim() ? wrap(ctx, subtitle.trim(), maxW) : [];
  const tLH = look.titleSize * 1.15;
  const sLH = look.subSize * 1.5;
  const lineGap = look.line && tLines.length && sLines.length ? look.subSize * 1.4 : sLines.length && tLines.length ? look.subSize * 0.6 : 0;
  const blockH = tLines.length * tLH + lineGap + sLines.length * sLH;
  const rise = (1 - a) * W * 0.03;
  let cy = y - blockH / 2 + rise;
  if (look.boxed) {
    let wMax = 0;
    ctx.font = look.titleFont;
    for (const l of tLines) wMax = Math.max(wMax, ctx.measureText(l).width);
    ctx.font = look.subFont;
    for (const l of sLines) wMax = Math.max(wMax, ctx.measureText(l).width);
    const padX = W * 0.06;
    const padY = W * 0.04;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillRect(W / 2 - wMax / 2 - padX, cy - padY, wMax + 2 * padX, blockH + 2 * padY);
    color = "#1c1b19";
  }
  if (look.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = W * 0.025;
  }
  ctx.fillStyle = color;
  ctx.font = look.titleFont;
  for (const l of tLines) {
    ctx.fillText(l, W / 2, cy + tLH / 2);
    cy += tLH;
  }
  if (lineGap) {
    if (look.line) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillRect(W / 2 - W * 0.06, cy + lineGap / 2 - W * 0.0015, W * 0.12, Math.max(1, W * 0.003));
      ctx.restore();
    }
    cy += lineGap;
  }
  ctx.font = look.subFont;
  for (const l of sLines) {
    ctx.fillText(l, W / 2, cy + sLH / 2);
    cy += sLH;
  }
  ctx.restore();
}

export function drawReelFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  tl: ReelTimeline,
  tpl: ReelTemplate,
  settings: ReelSettings,
  images: ReelImage[],
  fonts: ReelFonts
) {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (!images.length) {
    ctx.restore();
    return;
  }
  t = Math.max(0, Math.min(t, tl.total));
  const k = Math.max(0, Math.min(tl.segments - 1, Math.floor(t / tl.per)));
  const local = t - k * tl.per;
  const isLast = k === tl.segments - 1;
  const segLen = isLast ? tl.total - k * tl.per : tl.per;
  const p = clamp01(local / segLen);
  const inTransition = !isLast && local > tl.per - tl.transition;
  if (!inTransition) {
    drawSegment(ctx, W, H, k, p, tpl, images);
  } else {
    const q = clamp01((local - (tl.per - tl.transition)) / tl.transition);
    const e = easeInOut(q);
    switch (tpl.transition) {
      case "fade":
        drawSegment(ctx, W, H, k, p, tpl, images);
        ctx.globalAlpha = e;
        drawSegment(ctx, W, H, k + 1, 0, tpl, images);
        ctx.globalAlpha = 1;
        break;
      case "flash": {
        drawSegment(ctx, W, H, q < 0.5 ? k : k + 1, q < 0.5 ? p : 0, tpl, images);
        ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - Math.abs(q - 0.5) * 2)})`;
        ctx.fillRect(0, 0, W, H);
        break;
      }
      case "slide": {
        // Right to left reading: the next picture slides in from the left.
        ctx.save();
        ctx.translate(e * W, 0);
        drawSegment(ctx, W, H, k, p, tpl, images);
        ctx.restore();
        ctx.save();
        ctx.translate(-W + e * W, 0);
        drawSegment(ctx, W, H, k + 1, 0, tpl, images);
        ctx.restore();
        break;
      }
      case "zoom": {
        drawSegment(ctx, W, H, k + 1, 0, tpl, images);
        ctx.save();
        ctx.globalAlpha = 1 - e;
        ctx.translate(W / 2, H / 2);
        ctx.scale(1 + 0.35 * e, 1 + 0.35 * e);
        ctx.translate(-W / 2, -H / 2);
        drawSegment(ctx, W, H, k, p, tpl, images);
        ctx.restore();
        break;
      }
      case "black": {
        drawSegment(ctx, W, H, q < 0.5 ? k : k + 1, q < 0.5 ? p : 0, tpl, images);
        ctx.fillStyle = `rgba(0,0,0,${1 - Math.abs(q - 0.5) * 2})`;
        ctx.fillRect(0, 0, W, H);
        break;
      }
    }
  }

  if (tpl.grain) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    const tile = grain();
    const ox = Math.floor((t * 997) % 160);
    const oy = Math.floor((t * 613) % 160);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
    ctx.fillRect(0, 0, W + 160, H + 160);
    ctx.restore();
  }

  const bar = tpl.letterbox ? H * 0.1 : 0;
  if (bar) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  }

  const { text } = settings;
  if (text.show) {
    const look = textLook(tpl.textStyle, fonts, W);
    const y = text.position === "top" ? bar + H * 0.16 : text.position === "center" ? H * 0.5 : H - bar - H * 0.17;
    // The title opens the reel: in over 0.6s, held, out before the second photo is well under way.
    const titleEnd = Math.max(2.6, tl.per * 1.6);
    const aIn = easeOut(clamp01((t - 0.25) / 0.6));
    const aOut = 1 - clamp01((t - (titleEnd - 0.5)) / 0.5);
    const a = Math.min(aIn, aOut);
    if (a > 0 && !look.boxed && (text.title.trim() || text.subtitle.trim())) {
      // A soft scrim behind the text so it reads on any photo.
      const g = ctx.createLinearGradient(0, y - H * 0.2, 0, y + H * 0.2);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, `rgba(0,0,0,${0.32 * a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - H * 0.2, W, H * 0.4);
    }
    drawTextBlock(ctx, W, H, text.title, text.subtitle, y, a, look, text.color);
    if (tl.tail > 0) {
      const endStart = tl.total - tl.tail;
      const ea = easeOut(clamp01((t - endStart - 0.1) / 0.6));
      if (ea > 0) {
        ctx.fillStyle = `rgba(0,0,0,${0.45 * ea})`;
        ctx.fillRect(0, 0, W, H);
        drawTextBlock(ctx, W, H, text.ending, "", H * 0.5, ea, { ...look, boxed: false }, text.color);
      }
    }
  }
  ctx.restore();
}

// Loads one photo for drawing (same-origin, so the canvas stays exportable).
export async function loadReelImage(url: string): Promise<ReelImage> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { el: img, width: img.naturalWidth, height: img.naturalHeight };
}

// The page's real font family names (next/font gives them generated names) and a load of both
// faces before drawing, so the first frames don't fall back to a default font.
export async function reelFonts(): Promise<ReelFonts> {
  const css = getComputedStyle(document.documentElement);
  const serif = css.getPropertyValue("--font-gallery-serif").trim() || "serif";
  const sans = css.getPropertyValue("--font-rubik").trim() || "sans-serif";
  try {
    await Promise.all([document.fonts.load(`400 40px ${serif}`, "אבג"), document.fonts.load(`800 40px ${sans}`, "אבג")]);
  } catch {
    // Drawing still works with whatever font is ready.
  }
  return { serif, sans };
}
