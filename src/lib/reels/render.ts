import { REEL_TRANSITIONS, transitionInfo, type ReelLineStyle, type ReelSettings, type ReelTemplate, type ReelTransition } from "./templates";
import { clamp01, drawGrain, drawSegment, easeOut, type ReelImage, type Scene } from "./scene";
import { drawTransition } from "./transitions";

export type { ReelImage } from "./scene";

// The reel's frame at time t, drawn from scratch every time (a pure function of t), so the live
// preview and the exported MP4 are the same frames. Every size is relative to the canvas, so the
// small preview canvas and the full 1080-wide export look identical.

// `families` maps an album font key (src/lib/albumFonts.ts) to the CSS font family to draw it
// with, for the fonts the photographer picked for a line of text.
export type ReelFonts = { serif: string; sans: string; families: Record<string, string> };

export type ReelTimeline = {
  segments: number;
  durs: number[]; // seconds each segment shows (its transition into the next is inside it)
  starts: number[];
  transition: number; // the template's transition length at this pace (some run longer)
  pace: number; // how much faster (<1) or slower (>1) than the template's own timing
  tail: number; // the ending text's own screen at the end
  total: number; // the chosen length, or (with no fixed length) the sum of the segments
  fixed: boolean; // a length was chosen from the list
  dropped: number; // photos that don't fit the chosen length
  unit: number | null; // the beat subdivision the automatic cuts are on (null = no music tempo)
};

// The shortest a photo can stay on screen.
export const MIN_SEGMENT = 0.4;
// With no fixed length, a reel can grow up to this (Instagram's longest reel is 3 minutes).
export const MAX_FREE_LENGTH = 180;

export function segmentCount(photoCount: number, tpl: ReelTemplate) {
  return Math.max(1, tpl.frame === "split" ? Math.ceil(photoCount / 2) : photoCount);
}

const tailFor = (settings: ReelSettings, total: number) => (settings.text.show && settings.text.ending.trim() ? Math.min(1.8, total * 0.18) : 0);

// Moves every cut onto the nearest point of the beat grid (cumulatively, so the total stays the
// same), unless that would make a segment shorter than the minimum.
function snapCuts(durs: number[], unit: number | null): number[] {
  if (!unit) return durs;
  const out: number[] = [];
  let acc = 0;
  let prev = 0;
  const end = durs.reduce((x, y) => x + y, 0);
  for (let i = 0; i < durs.length; i++) {
    acc += durs[i];
    let cut = i === durs.length - 1 ? end : Math.round(acc / unit) * unit;
    if (cut - prev < MIN_SEGMENT || (i < durs.length - 1 && end - cut < MIN_SEGMENT * (durs.length - 1 - i))) cut = acc;
    out.push(cut - prev);
    prev = cut;
  }
  return out;
}

// The beat subdivision to cut on: whole beats when each segment gets several, otherwise half or
// quarter beats, so the shares stay close to what they'd be without music.
function beatUnit(bpm: number | null, share: number): number | null {
  if (!bpm) return null;
  let unit = 60 / bpm;
  while (share / unit < 4 && unit > 60 / bpm / 4) unit /= 2;
  return unit;
}

// The time each segment gets when the photographer hasn't set it. `prefs` is what each segment
// would like: a photo the template's own time, a video clip its own length. With a fixed length
// the shares are scaled to fill it (a clip never longer than itself); then the cuts move onto the
// music's beat when its tempo is known, so every transition lands on a beat.
export function autoDurations(prefs: number[], avail: number | null, bpm: number | null, videoMax: (number | null)[] = []): { durs: number[]; unit: number | null } {
  const n = prefs.length;
  let durs: number[];
  if (avail == null) {
    durs = prefs.map((p) => Math.max(MIN_SEGMENT, p));
  } else {
    durs = prefs.slice();
    const capped = new Set<number>();
    for (let round = 0; round < n; round++) {
      const freeIdx = durs.map((_, i) => i).filter((i) => !capped.has(i));
      const fixedSum = [...capped].reduce((x, i) => x + durs[i], 0);
      const prefSum = freeIdx.reduce((x, i) => x + prefs[i], 0) || 1;
      const scale = (avail - fixedSum) / prefSum;
      let changed = false;
      for (const i of freeIdx) {
        durs[i] = prefs[i] * scale;
        const max = videoMax[i];
        if (max != null && durs[i] > max && freeIdx.length > 1) {
          durs[i] = max;
          capped.add(i);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }
  const unit = beatUnit(bpm, durs.reduce((x, y) => x + y, 0) / Math.max(1, n));
  return { durs: snapCuts(durs, unit), unit };
}

// `segVideo` gives each segment's video length (null for a photo segment).
export function reelTimeline(photoCount: number, tpl: ReelTemplate, settings: ReelSettings, custom?: number[] | null, bpm?: number | null, segVideo: (number | null)[] = []): ReelTimeline {
  const all = segmentCount(photoCount, tpl);
  const fixed = settings.length != null;
  const validCustom = (n: number) => !!custom && custom.length === n && custom.every((d) => d >= MIN_SEGMENT - 1e-6);
  let durs: number[];
  let segments: number;
  let tail: number;
  let unit: number | null = null;
  if (fixed) {
    const total = settings.length as number;
    tail = tailFor(settings, total);
    const avail = total - tail;
    segments = Math.max(1, Math.min(all, Math.floor(avail / MIN_SEGMENT)));
    const sum = custom?.reduce((x, y) => x + y, 0) ?? 0;
    if (validCustom(segments) && Math.abs(sum - avail) < 0.02) durs = custom!.slice();
    else {
      const prefs = Array.from({ length: segments }, (_, i) => segVideo[i] ?? tpl.photoSeconds);
      ({ durs, unit } = autoDurations(prefs, avail, bpm ?? null, segVideo.slice(0, segments)));
    }
  } else {
    segments = all;
    if (validCustom(segments)) durs = custom!.slice();
    else {
      const prefs = Array.from({ length: segments }, (_, i) => Math.min(segVideo[i] ?? tpl.photoSeconds, 30));
      ({ durs, unit } = autoDurations(prefs, null, bpm ?? null));
    }
    // Never past the longest reel the networks take.
    let sum = durs.reduce((x, y) => x + y, 0);
    if (sum > MAX_FREE_LENGTH) durs = durs.map((d) => Math.max(MIN_SEGMENT, (d * MAX_FREE_LENGTH) / sum));
    sum = durs.reduce((x, y) => x + y, 0);
    tail = tailFor(settings, sum + 1.8);
  }
  const starts: number[] = [];
  let acc = 0;
  for (const d of durs) {
    starts.push(acc);
    acc += d;
  }
  const total = fixed ? (settings.length as number) : acc + tail;
  const pace = Math.max(0.5, Math.min(1.3, acc / segments / tpl.photoSeconds));
  const dropped = tpl.frame === "split" ? Math.max(0, photoCount - segments * 2) : Math.max(0, photoCount - segments);
  return { segments, durs, starts, transition: tpl.transitionSeconds * pace, pace, tail, total, fixed, dropped, unit };
}

// The clips playing at time t and how far into each one: a clip plays from the moment it starts
// coming in (the transition before it). Used to keep videos on the right frame.
export function activeMedia(t: number, tl: ReelTimeline, tpl: ReelTemplate, settings: ReelSettings, imageCount: number): { index: number; local: number }[] {
  if (!imageCount) return [];
  const pool = transitionPool(tpl, settings);
  const lenAfter = (k: number) => (k >= 0 && k < tl.segments - 1 ? transitionLength(transitionAfter(k, pool, settings.seed), tl, k) : 0);
  const per = tpl.frame === "split" ? 2 : 1;
  const out: { index: number; local: number }[] = [];
  const k = segmentAt(tl, t);
  const add = (seg: number) => {
    const from = tl.starts[seg] - lenAfter(seg - 1);
    for (let j = 0; j < per; j++) out.push({ index: (seg * per + j) % imageCount, local: Math.max(0, t - from) });
  };
  add(k);
  const len = lenAfter(k);
  if (len > 0 && t > tl.starts[k] + tl.durs[k] - len) add(k + 1);
  return out;
}

// The mix of transitions in use: the photographer's choice, or the template's own.
export function transitionPool(tpl: ReelTemplate, settings: ReelSettings): ReelTransition[] {
  const valid = new Set(REEL_TRANSITIONS.map((x) => x.id));
  const chosen = settings.transitions.filter((x) => valid.has(x));
  return chosen.length ? chosen : tpl.transitions;
}

// Which transition follows segment k, picked at random from the mix (by the seed, so it's the same
// on every frame and in the export), never the same one twice in a row.
export function transitionAfter(k: number, pool: ReelTransition[], seed: number): ReelTransition {
  const n = pool.length;
  if (n === 1) return pool[0];
  // Walked from the start (a reel has at most a few dozen), so a bumped pick is what the next
  // one is compared with.
  let prev = -1;
  let idx = 0;
  for (let i = 0; i <= k; i++) {
    idx = Math.floor(rand01(seed, i) * n);
    if (idx === prev) idx = (idx + 1) % n;
    prev = idx;
  }
  return pool[idx];
}

function rand01(seed: number, i: number) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// The length of the transition from segment k into k+1 (0 after the last segment).
function transitionLength(kind: ReelTransition, tl: ReelTimeline, k: number) {
  if (k < 0 || k >= tl.segments - 1) return 0;
  return Math.min(0.6 * Math.min(tl.durs[k], tl.durs[k + 1]), Math.max(tl.transition, transitionInfo(kind).min * tl.pace));
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

type FontBase = { weight: number; size: number; family: string };
type TextLook = { title: FontBase; sub: FontBase; boxed: boolean; line: boolean; shadow: boolean };

function textLook(style: ReelTemplate["textStyle"], fonts: ReelFonts, W: number): TextLook {
  const f = (weight: number, size: number, family: string): FontBase => ({ weight, size: W * size, family });
  switch (style) {
    case "bold":
      return { title: f(800, 0.105, fonts.sans), sub: f(600, 0.04, fonts.sans), boxed: false, line: false, shadow: true };
    case "cinema":
      return { title: f(400, 0.075, fonts.serif), sub: f(400, 0.032, fonts.sans), boxed: false, line: true, shadow: true };
    case "magazine":
      return { title: f(500, 0.07, fonts.serif), sub: f(500, 0.032, fonts.sans), boxed: true, line: false, shadow: false };
    case "modern":
      return { title: f(600, 0.08, fonts.sans), sub: f(400, 0.034, fonts.sans), boxed: false, line: true, shadow: true };
    default:
      return { title: f(400, 0.09, fonts.serif), sub: f(400, 0.034, fonts.sans), boxed: false, line: true, shadow: true };
  }
}

// The font of one line: the template's, or the album font the photographer picked, at their size.
function lineFont(base: FontBase, style: ReelLineStyle, fonts: ReelFonts): { font: string; size: number } {
  const size = base.size * (Math.max(30, Math.min(300, style.size || 100)) / 100);
  const picked = style.font ? fonts.families[style.font] : null;
  return picked ? { font: `400 ${size}px ${picked}`, size } : { font: `${base.weight} ${size}px ${base.family}`, size };
}

type Line = { text: string; font: string; size: number; color: string; rotate: number; lh: number };

function layoutLines(ctx: CanvasRenderingContext2D, text: string, base: FontBase, style: ReelLineStyle, fonts: ReelFonts, maxW: number, lhFactor: number): Line[] {
  if (!text.trim()) return [];
  const { font, size } = lineFont(base, style, fonts);
  ctx.font = font;
  return wrap(ctx, text.trim(), maxW).map((l) => ({ text: l, font, size, color: style.color, rotate: style.rotate || 0, lh: size * lhFactor }));
}

// A block of text (title + optional subtitle) centred at y, faded/raised by `a` (0-1). Each line
// turns around its own centre by its rotation.
function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  W: number,
  title: { text: string; style: ReelLineStyle },
  subtitle: { text: string; style: ReelLineStyle } | null,
  y: number,
  a: number,
  look: TextLook,
  fonts: ReelFonts
) {
  if (a <= 0 || (!title.text.trim() && !subtitle?.text.trim())) return;
  const maxW = W * 0.84;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = HEBREW.test(title.text + (subtitle?.text ?? "")) ? "rtl" : "ltr";
  const tLines = layoutLines(ctx, title.text, look.title, title.style, fonts, maxW, 1.15);
  const sLines = subtitle ? layoutLines(ctx, subtitle.text, look.sub, subtitle.style, fonts, maxW, 1.5) : [];
  const subSize = sLines[0]?.size ?? look.sub.size;
  const lineGap = look.line && tLines.length && sLines.length ? subSize * 1.4 : sLines.length && tLines.length ? subSize * 0.6 : 0;
  const blockH = tLines.reduce((h, l) => h + l.lh, 0) + lineGap + sLines.reduce((h, l) => h + l.lh, 0);
  const rise = (1 - a) * W * 0.03;
  let cy = y - blockH / 2 + rise;
  if (look.boxed) {
    let wMax = 0;
    for (const l of [...tLines, ...sLines]) {
      ctx.font = l.font;
      wMax = Math.max(wMax, ctx.measureText(l.text).width);
    }
    const padX = W * 0.06;
    const padY = W * 0.04;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillRect(W / 2 - wMax / 2 - padX, cy - padY, wMax + 2 * padX, blockH + 2 * padY);
  }
  const drawLine = (l: Line) => {
    ctx.save();
    if (look.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = W * 0.025;
    }
    ctx.translate(W / 2, cy + l.lh / 2);
    if (l.rotate) ctx.rotate((l.rotate * Math.PI) / 180);
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, 0, 0);
    ctx.restore();
    cy += l.lh;
  };
  for (const l of tLines) drawLine(l);
  if (lineGap) {
    if (look.line) {
      ctx.fillStyle = tLines[0]?.color ?? "#fff";
      ctx.fillRect(W / 2 - W * 0.06, cy + lineGap / 2 - W * 0.0015, W * 0.12, Math.max(1, W * 0.003));
    }
    cy += lineGap;
  }
  for (const l of sLines) drawLine(l);
  ctx.restore();
}

// Which segment is on screen at t.
function segmentAt(tl: ReelTimeline, t: number) {
  let k = 0;
  while (k < tl.segments - 1 && t >= tl.starts[k + 1]) k++;
  return k;
}

// The pictures at time t (a segment, or the move between two), without text or overlays. Each
// photo's motion runs from the moment it starts coming in (the transition before it) to the end
// of its own segment, so it never stands still during a transition and then jumps into motion.
function drawPictures(ctx: CanvasRenderingContext2D, sc: Scene, t: number, tl: ReelTimeline) {
  const pool = transitionPool(sc.tpl, sc.settings);
  const kindAfter = (k: number) => transitionAfter(k, pool, sc.settings.seed);
  const lenAfter = (k: number) => (k >= 0 && k < tl.segments - 1 ? transitionLength(kindAfter(k), tl, k) : 0);
  const progress = (k: number) => {
    const pre = lenAfter(k - 1);
    const end = k === tl.segments - 1 ? tl.total : tl.starts[k] + tl.durs[k];
    return clamp01((t - (tl.starts[k] - pre)) / (end - tl.starts[k] + pre));
  };
  const k = segmentAt(tl, t);
  const len = lenAfter(k);
  const segEnd = tl.starts[k] + tl.durs[k];
  if (len > 0 && t > segEnd - len) {
    const q = clamp01((t - (segEnd - len)) / len);
    drawTransition(ctx, sc, kindAfter(k), k, progress(k), progress(k + 1), q, sc.settings.seed * 131 + k);
    return;
  }
  drawSegment(ctx, sc, k, progress(k));
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
  const sc: Scene = { W, H, tpl, settings, images };
  ctx.save();
  drawPictures(ctx, sc, t, tl);
  ctx.restore();

  if (tpl.grain) drawGrain(ctx, W, H, t, 0.06);

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
    const titleEnd = Math.min(tl.total - tl.tail, Math.max(1.8, Math.min(3.2, tl.durs[0] + (tl.durs[1] ?? 0) * 0.6)));
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
    drawTextBlock(ctx, W, { text: text.title, style: text.styles.title }, { text: text.subtitle, style: text.styles.subtitle }, y, a, look, fonts);
    if (tl.tail > 0) {
      const endStart = tl.total - tl.tail;
      const ea = easeOut(clamp01((t - endStart - 0.1) / 0.6));
      if (ea > 0) {
        ctx.fillStyle = `rgba(0,0,0,${0.45 * ea})`;
        ctx.fillRect(0, 0, W, H);
        drawTextBlock(ctx, W, { text: text.ending, style: text.styles.ending }, null, H * 0.5, ea, { ...look, boxed: false }, fonts);
      }
    }
  }
  ctx.restore();
}

// One transition on a loop, for the picker's thumbnails: the first photo, the move, the second.
export function drawTransitionPreview(ctx: CanvasRenderingContext2D, W: number, H: number, kind: ReelTransition, q: number, tpl: ReelTemplate, settings: ReelSettings, images: ReelImage[]) {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (images.length) {
    const sc: Scene = { W, H, tpl, settings, images };
    // 0-0.3 the first photo, 0.3-0.75 the transition, then the second.
    if (q < 0.3) drawSegment(ctx, sc, 0, q);
    else if (q < 0.75) drawTransition(ctx, sc, kind, 0, q, (q - 0.3) * 0.5, (q - 0.3) / 0.45, 17);
    else drawSegment(ctx, sc, 1, (q - 0.3) * 0.5);
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
  return { serif, sans, families: {} };
}
