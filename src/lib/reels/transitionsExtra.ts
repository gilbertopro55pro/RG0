import { clamp01, drawBlurred, drawGrain, drawSegment, easeIn, easeInOut, easeOut, layer, rand, type Scene } from "./scene";

// 60 more transitions (10 per picker category), drawn like transitions.ts: the move from segment
// k (at progress p) to segment k+1 (at progress pB), q = 0-1 through it. Every frame covers the
// whole canvas, and the random parts come only from `salt`, so the preview and the file match.

export type ExtraTransition =
  // basic
  | "wipe"
  | "wipeup"
  | "crosszoom"
  | "zoomin"
  | "barn"
  | "barnh"
  | "cover"
  | "reveal"
  | "softzoom"
  | "whip"
  // light
  | "burn"
  | "flare"
  | "bokeh"
  | "glow"
  | "strobe"
  | "sunrise"
  | "rays"
  | "colorflash"
  | "exposure"
  | "sparkle"
  // glitch
  | "rgbsplit"
  | "pixelate"
  | "vhs"
  | "slices"
  | "jitter"
  | "static"
  | "tear"
  | "blocks"
  | "chroma"
  | "smear"
  // mask
  | "heart"
  | "star"
  | "diamond"
  | "hexagon"
  | "blinds"
  | "vblinds"
  | "clock"
  | "checker"
  | "wave"
  | "box"
  // 3d
  | "cubev"
  | "flipv"
  | "door"
  | "page"
  | "tumble"
  | "carousel"
  | "fold"
  | "swing"
  | "tunnel"
  | "spin"
  // motion
  | "spinblur"
  | "bounce"
  | "elastic"
  | "pulse"
  | "dolly"
  | "parallax"
  | "pop"
  | "hshake"
  | "punch"
  | "roll";

type Category = "basic" | "light" | "glitch" | "mask" | "3d" | "motion";

export const EXTRA_TRANSITIONS: { id: ExtraTransition; label: string; category: Category; min: number }[] = [
  { id: "wipe", label: "מחיקה לצד", category: "basic", min: 0.3 },
  { id: "wipeup", label: "מחיקה למעלה", category: "basic", min: 0.3 },
  { id: "crosszoom", label: "זום מוצלב", category: "basic", min: 0.4 },
  { id: "zoomin", label: "זום פנימה", category: "basic", min: 0.4 },
  { id: "barn", label: "דלתות נפתחות", category: "basic", min: 0.45 },
  { id: "barnh", label: "פתיחה לגובה", category: "basic", min: 0.45 },
  { id: "cover", label: "החלקה מעל", category: "basic", min: 0.35 },
  { id: "reveal", label: "חשיפה מתחת", category: "basic", min: 0.35 },
  { id: "softzoom", label: "זום רך", category: "basic", min: 0.5 },
  { id: "whip", label: "תנועת שוט", category: "basic", min: 0.3 },

  { id: "burn", label: "צריבה חמה", category: "light", min: 0.5 },
  { id: "flare", label: "קרן עדשה", category: "light", min: 0.5 },
  { id: "bokeh", label: "בוקה", category: "light", min: 0.6 },
  { id: "glow", label: "זוהר", category: "light", min: 0.5 },
  { id: "strobe", label: "סטרובוסקופ", category: "light", min: 0.45 },
  { id: "sunrise", label: "זריחה", category: "light", min: 0.6 },
  { id: "rays", label: "קרני אור", category: "light", min: 0.6 },
  { id: "colorflash", label: "הבזק צבעוני", category: "light", min: 0.3 },
  { id: "exposure", label: "חשיפת יתר", category: "light", min: 0.5 },
  { id: "sparkle", label: "נצנוצים", category: "light", min: 0.6 },

  { id: "rgbsplit", label: "פיצול צבעים", category: "glitch", min: 0.35 },
  { id: "pixelate", label: "פיקסלים", category: "glitch", min: 0.45 },
  { id: "vhs", label: "קלטת וידאו", category: "glitch", min: 0.5 },
  { id: "slices", label: "פרוסות", category: "glitch", min: 0.5 },
  { id: "jitter", label: "ריבועים קופצים", category: "glitch", min: 0.35 },
  { id: "static", label: "רעש טלוויזיה", category: "glitch", min: 0.4 },
  { id: "tear", label: "קריעת מסך", category: "glitch", min: 0.35 },
  { id: "blocks", label: "פירוק לריבועים", category: "glitch", min: 0.5 },
  { id: "chroma", label: "הבהוב צבע", category: "glitch", min: 0.35 },
  { id: "smear", label: "מריחה", category: "glitch", min: 0.5 },

  { id: "heart", label: "לב נפתח", category: "mask", min: 0.6 },
  { id: "star", label: "כוכב נפתח", category: "mask", min: 0.6 },
  { id: "diamond", label: "יהלום נפתח", category: "mask", min: 0.5 },
  { id: "hexagon", label: "משושה נפתח", category: "mask", min: 0.5 },
  { id: "blinds", label: "תריסים", category: "mask", min: 0.5 },
  { id: "vblinds", label: "תריסים אנכיים", category: "mask", min: 0.5 },
  { id: "clock", label: "מחוג שעון", category: "mask", min: 0.5 },
  { id: "checker", label: "לוח שחמט", category: "mask", min: 0.6 },
  { id: "wave", label: "גל", category: "mask", min: 0.5 },
  { id: "box", label: "מלבן נפתח", category: "mask", min: 0.45 },

  { id: "cubev", label: "קובייה אנכית", category: "3d", min: 0.5 },
  { id: "flipv", label: "היפוך אנכי", category: "3d", min: 0.5 },
  { id: "door", label: "דלת", category: "3d", min: 0.55 },
  { id: "page", label: "דפדוף", category: "3d", min: 0.6 },
  { id: "tumble", label: "נפילה לאחור", category: "3d", min: 0.55 },
  { id: "carousel", label: "קרוסלה", category: "3d", min: 0.55 },
  { id: "fold", label: "קיפול", category: "3d", min: 0.5 },
  { id: "swing", label: "נדנוד מלמעלה", category: "3d", min: 0.6 },
  { id: "tunnel", label: "מנהרה", category: "3d", min: 0.6 },
  { id: "spin", label: "סיבוב רבע", category: "3d", min: 0.5 },

  { id: "spinblur", label: "סחרור מטושטש", category: "motion", min: 0.4 },
  { id: "bounce", label: "קפיצה", category: "motion", min: 0.6 },
  { id: "elastic", label: "גומי", category: "motion", min: 0.6 },
  { id: "pulse", label: "פעימה", category: "motion", min: 0.5 },
  { id: "dolly", label: "דולי", category: "motion", min: 0.5 },
  { id: "parallax", label: "פרלקסה", category: "motion", min: 0.6 },
  { id: "pop", label: "פופ", category: "motion", min: 0.4 },
  { id: "hshake", label: "רעידה לצדדים", category: "motion", min: 0.35 },
  { id: "punch", label: "זום חבטה", category: "motion", min: 0.3 },
  { id: "roll", label: "גלגול פנימה", category: "motion", min: 0.5 },
];

const bounceOut = (x: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) {
    const t = x - 1.5 / d;
    return n * t * t + 0.75;
  }
  if (x < 2.5 / d) {
    const t = x - 2.25 / d;
    return n * t * t + 0.9375;
  }
  const t = x - 2.625 / d;
  return n * t * t + 0.984375;
};

const elasticOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

// The scale that keeps a W×H picture covering the W×H frame while it's turned by `a`.
const coverScale = (W: number, H: number, a: number) => Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)) * Math.max(W / H, H / W);

// A thin horizontal-lines tile for the VHS look (one per process, drawn as a pattern).
let scanTile: HTMLCanvasElement | null = null;
function scanlines(): HTMLCanvasElement {
  if (scanTile) return scanTile;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 4;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,1)";
  g.fillRect(0, 0, 4, 2);
  scanTile = c;
  return c;
}

// A picture (already drawn into `src`) turned by `theta` around one of its edges, in perspective:
// cut into strips, each scaled by its depth (an affine transform can't make a trapezoid).
function hinge(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, W: number, H: number, edge: "left" | "right" | "top" | "bottom", theta: number, shade: number) {
  const horizontal = edge === "left" || edge === "right";
  const len = horizontal ? W : H;
  const cross = horizontal ? H : W;
  const f = Math.max(W, H) * 2.2;
  const n = 24;
  const c = len / 2;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const proj = (d: number) => {
    const s = f / (f + d * sin);
    const world = edge === "left" || edge === "top" ? d * cos : len - d * cos;
    return { pos: c + (world - c) * s, s };
  };
  // The outline of the turned picture (near edge, then far edge), for one smooth shade.
  const near: [number, number][] = [];
  const far: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const d0 = Math.round((i / n) * len);
    const d1 = Math.round(((i + 1) / n) * len);
    const a = proj(d0);
    const b = proj(d1);
    const lo = Math.min(a.pos, b.pos);
    const exact = Math.abs(b.pos - a.pos);
    const s = (a.s + b.s) / 2;
    const span = cross * s;
    const off = (cross - span) / 2;
    if (i === 0) near.push([a.pos, (cross - cross * a.s) / 2]);
    near.push([b.pos, (cross - cross * b.s) / 2]);
    if (exact < 0.05) continue;
    // Each strip overlaps its neighbour by a pixel, so no seams show.
    const size = exact + (i < n - 1 ? 1 : 0);
    const lo2 = edge === "right" || edge === "bottom" ? lo - (i < n - 1 ? 1 : 0) : lo;
    // The source strip, in the picture's own coordinates.
    const s0 = edge === "left" || edge === "top" ? d0 : len - d1;
    const sl = d1 - d0;
    if (horizontal) ctx.drawImage(src, s0, 0, sl, H, lo2, off, size, span);
    else ctx.drawImage(src, 0, s0, W, sl, off, lo2, span, size);
  }
  if (shade <= 0) return;
  for (const [pos, o] of near) far.push([pos, cross - o]);
  const pts = near.concat(far.reverse());
  ctx.save();
  ctx.beginPath();
  pts.forEach(([pos, o], i) => {
    const x = horizontal ? pos : o;
    const y = horizontal ? o : pos;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  const start = near[0][0];
  const end = near[near.length - 1][0];
  const g = horizontal ? ctx.createLinearGradient(start, 0, end === start ? start + 1 : end, 0) : ctx.createLinearGradient(0, start, 0, end === start ? start + 1 : end);
  g.addColorStop(0, `rgba(0,0,0,${Math.min(0.9, shade * 0.6)})`);
  g.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, shade)})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

export function drawExtraTransition(ctx: CanvasRenderingContext2D, sc: Scene, kind: ExtraTransition, k: number, p: number, pB: number, q: number, salt: number): void {
  const { W, H } = sc;
  const e = easeInOut(q);
  const A = (c: CanvasRenderingContext2D = ctx) => drawSegment(c, sc, k, p);
  const B = (c: CanvasRenderingContext2D = ctx) => drawSegment(c, sc, k + 1, pB);
  const dir = rand(salt, 7) < 0.5 ? 1 : -1;
  const pulse = 1 - Math.abs(q - 0.5) * 2;
  const hyp = Math.hypot(W, H) / 2;

  // Draws `fn` moved/turned/scaled around the centre of the frame.
  const xf = (tx: number, ty: number, s: number, rot: number, fn: () => void, alpha = 1) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2 + tx, H / 2 + ty);
    if (rot) ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H / 2);
    fn();
    ctx.restore();
  };
  const dim = (a: number) => {
    if (a <= 0) return;
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`;
    ctx.fillRect(0, 0, W, H);
  };
  const black = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
  };
  const cut = q < 0.5 ? A : B;

  switch (kind) {
    // ---------- basic ----------
    case "wipe":
    case "wipeup": {
      A();
      ctx.save();
      ctx.beginPath();
      if (kind === "wipe") ctx.rect(0, 0, e * W, H);
      else ctx.rect(0, H * (1 - e), W, H * e);
      ctx.clip();
      B();
      ctx.restore();
      return;
    }
    case "crosszoom": {
      xf(0, 0, 1 + 0.8 * easeIn(q), 0, () => A());
      xf(0, 0, 1.2 - 0.2 * easeOut(q), 0, () => B(), e);
      return;
    }
    case "zoomin": {
      A();
      dim(0.3 * e);
      xf(0, 0, 0.6 + 0.4 * easeOut(q), 0, () => B(), Math.min(1, q * 2.2));
      return;
    }
    case "barn":
    case "barnh": {
      B();
      const lg = layer(2, W, H);
      A(lg);
      const d = e * (kind === "barn" ? W : H) * 0.5;
      if (kind === "barn") {
        ctx.drawImage(lg.canvas, 0, 0, W / 2, H, -d, 0, W / 2, H);
        ctx.drawImage(lg.canvas, W / 2, 0, W / 2, H, W / 2 + d, 0, W / 2, H);
      } else {
        ctx.drawImage(lg.canvas, 0, 0, W, H / 2, 0, -d, W, H / 2);
        ctx.drawImage(lg.canvas, 0, H / 2, W, H / 2, 0, H / 2 + d, W, H / 2);
      }
      // Soft shadows the two doors throw into the opening.
      const sa = 0.5 * Math.min(1, q * 4, (1 - q) * 4);
      const sw = W * 0.06;
      if (d > 0.5 && sa > 0) {
        for (const side of [-1, 1]) {
          const edge = (kind === "barn" ? W : H) / 2 + side * d;
          const g = kind === "barn" ? ctx.createLinearGradient(edge, 0, edge - side * sw, 0) : ctx.createLinearGradient(0, edge, 0, edge - side * sw);
          g.addColorStop(0, `rgba(0,0,0,${sa})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          const lo = side > 0 ? edge - sw : edge;
          if (kind === "barn") ctx.fillRect(lo, 0, sw, H);
          else ctx.fillRect(0, lo, W, sw);
        }
      }
      return;
    }
    case "cover":
    case "reveal": {
      // cover: B slides in over a still A. reveal: A slides off a still B. The moving picture's
      // edge casts a soft shadow on the still one.
      const over = kind === "cover";
      if (over) {
        A();
        dim(0.35 * e);
      } else {
        B();
        dim(0.4 * (1 - e));
      }
      const tx = over ? dir * W * (1 - e) : -dir * W * e;
      // The edge that faces the still picture, and which way the shadow falls from it.
      const edge = over ? (dir > 0 ? tx : tx + W) : dir > 0 ? tx + W : tx;
      const side = over ? -dir : dir;
      const sw = W * 0.07;
      const g = ctx.createLinearGradient(edge, 0, edge + side * sw, 0);
      g.addColorStop(0, `rgba(0,0,0,${0.55 * Math.min(1, pulse * 3)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(edge, edge + side * sw), 0, sw, H);
      ctx.save();
      ctx.translate(tx, 0);
      if (over) B();
      else A();
      ctx.restore();
      return;
    }
    case "softzoom": {
      const blur = pulse * 0.32;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(1 + 0.12 * e, 1 + 0.12 * e);
      ctx.translate(-W / 2, -H / 2);
      drawBlurred(ctx, sc, k, p, blur);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = e;
      ctx.translate(W / 2, H / 2);
      ctx.scale(1.12 - 0.12 * e, 1.12 - 0.12 * e);
      ctx.translate(-W / 2, -H / 2);
      drawBlurred(ctx, sc, k + 1, pB, blur);
      ctx.restore();
      return;
    }
    case "whip": {
      const m = easeInOut(e);
      const lg = layer(2, W, H);
      lg.save();
      lg.translate(-dir * m * W, 0);
      A(lg);
      lg.restore();
      lg.save();
      lg.translate(dir * (1 - m) * W, 0);
      B(lg);
      lg.restore();
      ctx.drawImage(lg.canvas, 0, 0);
      const smear = W * 0.09 * Math.pow(pulse, 0.8);
      if (smear > 0.5) {
        ctx.save();
        for (let i = 1; i <= 5; i++) {
          ctx.globalAlpha = 0.24;
          ctx.drawImage(lg.canvas, dir * i * smear, 0);
          ctx.globalAlpha = 0.14;
          ctx.drawImage(lg.canvas, -dir * i * smear * 0.5, 0);
        }
        ctx.restore();
      }
      return;
    }

    // ---------- light ----------
    case "burn": {
      cut();
      const cx = rand(salt, 31) < 0.5 ? 0 : W;
      const cy = rand(salt, 32) < 0.5 ? 0 : H;
      const r = hyp * 2 * (0.25 + 1.1 * q);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(255,240,200,${pulse})`);
      g.addColorStop(0.45, `rgba(255,130,30,${0.85 * pulse})`);
      g.addColorStop(1, "rgba(160,20,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,110,30,${0.85 * Math.pow(pulse, 2.2)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "flare": {
      A();
      ctx.save();
      ctx.globalAlpha = e;
      B();
      ctx.restore();
      const it = Math.pow(pulse, 0.7);
      if (it <= 0.01) return;
      const x = W * (-0.2 + 1.4 * q);
      const y = H * (0.28 + 0.44 * rand(salt, 33));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(x, y, 0, x, y, W * 0.45);
      glow.addColorStop(0, `rgba(255,250,235,${it})`);
      glow.addColorStop(0.25, `rgba(255,200,140,${0.45 * it})`);
      glow.addColorStop(1, "rgba(255,160,90,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      for (const [h, a] of [
        [W * 0.07, 0.35],
        [W * 0.012, 1],
      ] as const) {
        const lgr = ctx.createLinearGradient(0, 0, W, 0);
        const cxn = clamp01(x / W);
        lgr.addColorStop(0, "rgba(140,200,255,0)");
        lgr.addColorStop(Math.max(0, cxn - 0.001), `rgba(200,230,255,${a * it})`);
        lgr.addColorStop(Math.min(1, cxn + 0.001), `rgba(200,230,255,${a * it})`);
        lgr.addColorStop(1, "rgba(140,200,255,0)");
        ctx.fillStyle = lgr;
        ctx.fillRect(0, y - h / 2, W, h);
      }
      // Ghosts along the line from the flare through the centre.
      const ghosts: [number, number, string][] = [
        [0.6, 0.05, "120,255,180"],
        [1.2, 0.09, "180,120,255"],
        [1.7, 0.035, "255,200,120"],
      ];
      for (const [t, rr, rgb] of ghosts) {
        const gx = x + (W / 2 - x) * t;
        const gy = y + (H / 2 - y) * t;
        const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, W * rr * 2);
        gg.addColorStop(0, `rgba(${rgb},${0.28 * it})`);
        gg.addColorStop(0.7, `rgba(${rgb},${0.18 * it})`);
        gg.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gg;
        ctx.fillRect(gx - W * rr * 2, gy - W * rr * 2, W * rr * 4, W * rr * 4);
      }
      ctx.restore();
      return;
    }
    case "bokeh": {
      A();
      ctx.save();
      ctx.globalAlpha = e;
      B();
      ctx.restore();
      if (pulse <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const colors = ["255,214,150", "255,170,120", "255,240,210", "255,150,180", "200,220,255"];
      for (let i = 0; i < 22; i++) {
        const r = W * (0.04 + 0.1 * rand(salt, i, 41));
        const x = rand(salt, i, 42) * W;
        const y = (rand(salt, i, 43) * 1.2 - 0.1) * H - q * H * (0.08 + 0.12 * rand(salt, i, 44));
        const a = pulse * (0.35 + 0.5 * rand(salt, i, 45));
        const rgb = colors[Math.floor(rand(salt, i, 46) * colors.length)];
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${rgb},${a * 0.55})`);
        g.addColorStop(0.82, `rgba(${rgb},${a * 0.8})`);
        g.addColorStop(0.92, `rgba(${rgb},${a})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
      return;
    }
    case "glow": {
      const mix = easeInOut(clamp01((q - 0.3) / 0.4));
      A();
      ctx.save();
      ctx.globalAlpha = mix;
      B();
      ctx.restore();
      if (pulse <= 0.01) return;
      const sw = Math.max(8, Math.round(W / 12));
      const sh = Math.max(8, Math.round(H / 12));
      const small = layer(2, sw, sh);
      small.scale(sw / W, sh / H);
      A(small);
      small.globalAlpha = mix;
      B(small);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.95 * pulse;
      ctx.drawImage(small.canvas, 0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 * pulse * pulse;
      ctx.drawImage(small.canvas, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06);
      ctx.restore();
      return;
    }
    case "strobe": {
      const centres = [0.2, 0.5, 0.8];
      const seq = q < 0.2 ? A : q < 0.5 ? B : q < 0.8 ? A : B;
      seq();
      let fl = 0;
      for (const c of centres) fl = Math.max(fl, 1 - Math.abs(q - c) / 0.07);
      if (fl > 0) {
        ctx.fillStyle = `rgba(255,255,255,${fl})`;
        ctx.fillRect(0, 0, W, H);
      }
      return;
    }
    case "sunrise": {
      A();
      const y = H * (1.15 - 1.3 * e);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, Math.max(0, y), W, H);
      ctx.clip();
      B();
      ctx.restore();
      if (pulse <= 0.01) return;
      const band = H * 0.22;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(255,150,80,${0.25 * pulse})`;
      ctx.fillRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, y - band, 0, y + band);
      g.addColorStop(0, "rgba(255,190,110,0)");
      g.addColorStop(0.45, `rgba(255,225,160,${0.9 * pulse})`);
      g.addColorStop(0.55, `rgba(255,170,90,${0.8 * pulse})`);
      g.addColorStop(1, "rgba(255,90,60,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - band, W, band * 2);
      ctx.restore();
      return;
    }
    case "rays": {
      A();
      ctx.save();
      ctx.globalAlpha = e;
      B();
      ctx.restore();
      if (pulse <= 0.01) return;
      const right = rand(salt, 51) < 0.5;
      const cx = right ? W * 1.05 : -W * 0.05;
      const cy = -H * 0.05;
      const base = Math.atan2(H / 2 - cy, W / 2 - cx);
      const L = hyp * 2.4;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = base + (rand(salt, i, 52) - 0.5) * 1.3 + (q - 0.5) * 0.3 * (right ? -1 : 1);
        const w = 0.025 + 0.06 * rand(salt, i, 53);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a - w) * L, cy + Math.sin(a - w) * L);
        ctx.lineTo(cx + Math.cos(a + w) * L, cy + Math.sin(a + w) * L);
        ctx.closePath();
      }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, L);
      g.addColorStop(0, "rgba(255,245,215,0.85)");
      g.addColorStop(0.5, "rgba(255,220,160,0.35)");
      g.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = g;
      ctx.fill();
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.6);
      cg.addColorStop(0, "rgba(255,240,210,0.8)");
      cg.addColorStop(1, "rgba(255,220,170,0)");
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "colorflash": {
      xf(0, 0, 1 + 0.06 * pulse, 0, () => cut());
      const a = 0.92 * Math.pow(pulse, 0.8);
      if (a <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, `rgba(255,60,170,${a})`);
      g.addColorStop(1, `rgba(0,225,210,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "exposure": {
      if (q < 0.5) xf(0, 0, 1 + 0.08 * q * 2, 0, () => A());
      else xf(0, 0, 1.08 - 0.08 * (q - 0.5) * 2, 0, () => B());
      const a = q < 0.5 ? easeIn(q * 2) : easeIn((1 - q) * 2);
      if (a <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "sparkle": {
      A();
      ctx.save();
      ctx.globalAlpha = e;
      B();
      ctx.restore();
      if (pulse <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 46; i++) {
        const x = rand(salt, i, 61) * W;
        const y = rand(salt, i, 62) * H;
        const tw = Math.max(0, Math.sin((q * 2.5 + rand(salt, i, 63)) * Math.PI * 2));
        const a = pulse * tw;
        if (a < 0.03) continue;
        const r = W * (0.012 + 0.03 * rand(salt, i, 64)) * (0.6 + 0.4 * tw);
        const thin = r * 0.16;
        ctx.globalAlpha = a;
        ctx.fillStyle = rand(salt, i, 65) < 0.5 ? "#fff6dc" : "#ffd27a";
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + thin, y - thin);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x + thin, y + thin);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - thin, y + thin);
        ctx.lineTo(x - r, y);
        ctx.lineTo(x - thin, y - thin);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // ---------- glitch ----------
    case "rgbsplit": {
      const dx = W * 0.06 * Math.pow(pulse, 0.8);
      if (dx < 0.5) {
        cut();
        return;
      }
      const src = layer(2, W, H);
      cut(src);
      const red = layer(3, W, H);
      red.drawImage(src.canvas, 0, 0);
      red.globalCompositeOperation = "multiply";
      red.fillStyle = "#ff0000";
      red.fillRect(0, 0, W, H);
      const cyan = layer(4, W, H);
      cyan.drawImage(src.canvas, 0, 0);
      cyan.globalCompositeOperation = "multiply";
      cyan.fillStyle = "#00ffff";
      cyan.fillRect(0, 0, W, H);
      black();
      const step = Math.floor(q * 12);
      const dy = (rand(salt, step, 71) - 0.5) * H * 0.02 * pulse;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(red.canvas, dx, dy);
      ctx.drawImage(cyan.canvas, -dx, -dy);
      ctx.restore();
      // A couple of slices pushed sideways.
      for (let i = 0; i < 3; i++) {
        if (rand(salt, step, i, 72) > 0.6) continue;
        const y = rand(salt, step, i, 73) * H;
        const h = H * (0.015 + 0.05 * rand(salt, step, i, 74));
        ctx.drawImage(src.canvas, 0, y, W, h, (rand(salt, step, i, 75) - 0.5) * W * 0.15 * pulse, y, W, h);
      }
      return;
    }
    case "pixelate": {
      const px = Math.max(1, Math.round(1 + (W / 12 - 1) * Math.pow(pulse, 1.3)));
      if (px <= 1) {
        cut();
        return;
      }
      const tw = Math.max(2, Math.ceil(W / px));
      const th = Math.max(2, Math.ceil(H / px));
      const tiny = layer(2, tw, th);
      tiny.scale(tw / W, th / H);
      cut(tiny);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tiny.canvas, 0, 0, tw * px, th * px);
      ctx.restore();
      return;
    }
    case "vhs": {
      const lg = layer(2, W, H);
      cut(lg);
      const r = H * 0.55 * Math.pow(pulse, 1.6);
      ctx.drawImage(lg.canvas, 0, r);
      if (r > 0.5) ctx.drawImage(lg.canvas, 0, r - H);
      if (pulse <= 0.01) return;
      // Wobbling bands.
      for (let i = 0; i < 3; i++) {
        const y = ((rand(salt, i, 81) + q * 1.7) % 1) * H;
        const h = H * 0.05;
        const dx = Math.sin(q * 40 + i * 2) * W * 0.04 * pulse;
        ctx.drawImage(lg.canvas, 0, (y - r + 2 * H) % H, W, h, dx, y, W, h);
      }
      ctx.fillStyle = `rgba(0,0,0,${0.85 * pulse})`;
      ctx.fillRect(0, r - H * 0.025, W, H * 0.05);
      ctx.save();
      ctx.globalAlpha = 0.4 * pulse;
      ctx.fillStyle = ctx.createPattern(scanlines(), "repeat")!;
      ctx.scale(1, Math.max(1, H / 640));
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(70,0,130,${0.18 * pulse})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      drawGrain(ctx, W, H, Math.floor(q * 30) + salt, 0.22 * pulse, Math.max(1, W / 360));
      return;
    }
    case "slices": {
      const la = layer(2, W, H);
      A(la);
      const lb = layer(3, W, H);
      B(lb);
      black();
      const n = 8;
      for (let i = 0; i < n; i++) {
        const x0 = Math.round((i / n) * W);
        const x1 = Math.round(((i + 1) / n) * W);
        const d = rand(salt, i, 91) * 0.4;
        const sd = rand(salt, i, 92) < 0.5 ? 1 : -1;
        const local = easeInOut(clamp01((q - d) / 0.6));
        ctx.drawImage(la.canvas, x0, 0, x1 - x0, H, x0, local * H * sd, x1 - x0, H);
        ctx.drawImage(lb.canvas, x0, 0, x1 - x0, H, x0, (local - 1) * H * sd, x1 - x0, H);
      }
      return;
    }
    case "jitter": {
      const lg = layer(2, W, H);
      cut(lg);
      ctx.drawImage(lg.canvas, 0, 0);
      if (pulse <= 0.05) return;
      const lo = layer(3, W, H);
      (q < 0.5 ? B : A)(lo);
      const step = Math.floor(q * 16);
      const n = 4 + Math.round(12 * pulse);
      for (let i = 0; i < n; i++) {
        const s = W * (0.06 + 0.14 * rand(salt, step, i, 101));
        const x = rand(salt, step, i, 102) * (W - s);
        const y = rand(salt, step, i, 103) * (H - s);
        const ox = (rand(salt, step, i, 104) - 0.5) * W * 0.3 * pulse;
        const oy = (rand(salt, step, i, 105) - 0.5) * W * 0.12 * pulse;
        const src = rand(salt, step, i, 106) < 0.5 ? lo : lg;
        ctx.drawImage(src.canvas, x, y, s, s, x + ox, y + oy, s, s);
        if (rand(salt, step, i, 107) < 0.25) {
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = rand(salt, step, i, 108) < 0.5 ? `rgba(255,0,140,${0.45 * pulse})` : `rgba(0,255,120,${0.4 * pulse})`;
          ctx.fillRect(x + ox, y + oy, s, s);
          ctx.restore();
        }
      }
      return;
    }
    case "static": {
      const step = Math.floor(q * 40);
      const jy = (rand(salt, step, 111) - 0.5) * H * 0.04 * pulse;
      xf(0, jy, 1 + 0.05 * pulse, 0, () => cut());
      if (pulse <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = "saturation";
      ctx.fillStyle = `rgba(128,128,128,${pulse})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      drawGrain(ctx, W, H, step * 7 + salt, Math.min(0.96, 1.15 * Math.pow(pulse, 1.2)), Math.max(1, W / 300));
      const by = ((q * 2.6) % 1) * H;
      ctx.fillStyle = `rgba(255,255,255,${0.22 * pulse})`;
      ctx.fillRect(0, by, W, H * 0.07);
      return;
    }
    case "tear": {
      const lg = layer(2, W, H);
      cut(lg);
      ctx.drawImage(lg.canvas, 0, 0);
      if (pulse <= 0.05) return;
      let lo: CanvasRenderingContext2D | null = null;
      if (pulse > 0.35) {
        lo = layer(3, W, H);
        (q < 0.5 ? B : A)(lo);
      }
      const step = Math.floor(q * 9);
      for (let i = 0; i < 4; i++) {
        const h = H * (0.08 + 0.17 * rand(salt, step, i, 121));
        const y = rand(salt, step, i, 122) * (H - h);
        const dx = (rand(salt, step, i, 123) - 0.5) * 2 * W * 0.45 * pulse;
        const src = lo && rand(salt, step, i, 124) < 0.4 ? lo : lg;
        ctx.drawImage(src.canvas, 0, y, W, h, dx, y, W, h);
        ctx.drawImage(src.canvas, 0, y, W, h, dx - Math.sign(dx) * W, y, W, h);
        ctx.fillStyle = `rgba(255,255,255,${0.5 * pulse})`;
        ctx.fillRect(0, y, W, Math.max(1, H * 0.003));
      }
      return;
    }
    case "blocks": {
      A();
      const lb = layer(2, W, H);
      B(lb);
      const cell = Math.ceil(W / 9);
      const cols = Math.ceil(W / cell);
      const rows = Math.ceil(H / cell);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = rand(salt, r, c, 131) * 0.85;
          const local = (q - t) / 0.15;
          if (local <= 0) continue;
          const x = c * cell;
          const y = r * cell;
          ctx.drawImage(lb.canvas, x, y, cell, cell, x, y, cell, cell);
          if (local < 1) {
            const pick = rand(salt, r, c, 132);
            ctx.fillStyle = pick < 0.33 ? `rgba(0,240,255,${0.7 * (1 - local)})` : pick < 0.66 ? `rgba(255,0,170,${0.7 * (1 - local)})` : `rgba(255,255,255,${0.7 * (1 - local)})`;
            ctx.fillRect(x, y, cell, cell);
          }
        }
      }
      return;
    }
    case "chroma": {
      const step = Math.floor(q * 12);
      const ox = (rand(salt, step, 141) - 0.5) * W * 0.03 * pulse;
      const oy = (rand(salt, step, 142) - 0.5) * W * 0.03 * pulse;
      xf(ox, oy, 1 + 0.06 * pulse, 0, () => cut());
      if (pulse <= 0.02) return;
      xf(-ox * 2, -oy * 2, 1 + 0.06 * pulse, 0, () => (q < 0.5 ? B : A)(), 0.25 * pulse);
      const palette = ["255,0,200", "0,230,255", "255,230,0", "40,255,90"];
      const rgb = palette[Math.floor(rand(salt, step, 143) * palette.length)];
      ctx.save();
      ctx.globalCompositeOperation = step % 2 ? "multiply" : "screen";
      ctx.fillStyle = `rgba(${rgb},${0.6 * pulse})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "smear": {
      A();
      const lb = layer(2, W, H);
      B(lb);
      const rows = 14;
      for (let i = 0; i < rows; i++) {
        const y = Math.round((i / rows) * H);
        const h = Math.round(((i + 1) / rows) * H) - y;
        const d = rand(salt, i, 151) * 0.4;
        const local = easeOut(clamp01((q - d) / 0.6));
        if (local <= 0) continue;
        const s = 1 + 2.5 * (1 - local);
        const x = dir > 0 ? 0 : W - W * s;
        ctx.save();
        ctx.globalAlpha = Math.min(1, local * 3);
        ctx.drawImage(lb.canvas, 0, y, W, h, x, y, W * s, h);
        ctx.restore();
      }
      return;
    }

    // ---------- mask ----------
    case "heart":
    case "star":
    case "diamond":
    case "hexagon": {
      A();
      const cx = W / 2;
      const cy = H / 2;
      const path = () => {
        ctx.beginPath();
        if (kind === "heart") {
          const u = (Math.pow(e, 2.5) * hyp) / 3.4;
          const n = 48;
          for (let i = 0; i <= n; i++) {
            const t = (i / n) * Math.PI * 2;
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + 2;
            if (i === 0) ctx.moveTo(cx + x * u, cy + y * u);
            else ctx.lineTo(cx + x * u, cy + y * u);
          }
        } else if (kind === "star") {
          const R = Math.pow(e, 2.2) * hyp * 2.7;
          const rot = -Math.PI / 2 + e * 0.7 * dir;
          for (let i = 0; i < 10; i++) {
            const a = rot + (i * Math.PI) / 5;
            const r = i % 2 ? R * 0.48 : R;
            if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
        } else if (kind === "diamond") {
          const R = e * ((W + H) / 2) * 1.04;
          ctx.moveTo(cx, cy - R);
          ctx.lineTo(cx + R, cy);
          ctx.lineTo(cx, cy + R);
          ctx.lineTo(cx - R, cy);
        } else {
          const R = (e * hyp * 1.04) / Math.cos(Math.PI / 6);
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3 + e * 0.5;
            if (i === 0) ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
            else ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
          }
        }
        ctx.closePath();
      };
      if (e <= 0.001) return;
      ctx.save();
      path();
      ctx.clip();
      B();
      ctx.restore();
      ctx.save();
      path();
      ctx.lineJoin = "round";
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - e)})`;
      ctx.lineWidth = Math.max(1.5, W * 0.012);
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = W * 0.02;
      ctx.stroke();
      ctx.restore();
      return;
    }
    case "blinds":
    case "vblinds": {
      A();
      const n = 8;
      const vert = kind === "vblinds";
      const size = (vert ? W : H) / n;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const local = easeInOut(clamp01((q - i * 0.04) / (1 - (n - 1) * 0.04)));
        if (local <= 0) continue;
        if (vert) {
          const w = size * local;
          ctx.rect(i * size + (size - w) / 2, 0, w + 0.5, H);
        } else {
          ctx.rect(0, i * size, W, size * local + 0.5);
        }
      }
      ctx.clip();
      B();
      ctx.restore();
      return;
    }
    case "clock": {
      A();
      if (e <= 0) return;
      const a0 = -Math.PI / 2;
      const a1 = a0 + e * Math.PI * 2 * dir;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(W / 2, H / 2);
      ctx.arc(W / 2, H / 2, hyp * 1.1, a0, a1, dir < 0);
      ctx.closePath();
      ctx.clip();
      B();
      ctx.restore();
      if (e < 1) {
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${0.8 * pulse})`;
        ctx.lineWidth = Math.max(1, W * 0.006);
        ctx.beginPath();
        ctx.moveTo(W / 2, H / 2);
        ctx.lineTo(W / 2 + Math.cos(a1) * hyp * 1.1, H / 2 + Math.sin(a1) * hyp * 1.1);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    case "checker": {
      A();
      const lb = layer(2, W, H);
      B(lb);
      const cell = Math.ceil(W / 5);
      const cols = Math.ceil(W / cell);
      const rows = Math.ceil(H / cell);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const parity = (r + c) % 2;
          const start = parity ? 0.4 : 0;
          const stagger = ((r * cols + c) / (rows * cols)) * 0.15;
          const local = easeOut(clamp01((q - start - stagger) / 0.45));
          if (local <= 0) continue;
          const s = cell * local;
          const x = c * cell + (cell - s) / 2;
          const y = r * cell + (cell - s) / 2;
          ctx.drawImage(lb.canvas, x, y, s, s, x, y, s, s);
        }
      }
      return;
    }
    case "wave": {
      A();
      const amp = H * 0.035;
      const base = H + amp - e * (H + amp * 2);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, H);
      const n = 32;
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * W;
        const y = base + Math.sin((i / n) * Math.PI * 3 + q * 8) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      B();
      ctx.restore();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * pulse})`;
      ctx.lineWidth = Math.max(1, W * 0.008);
      ctx.stroke();
      ctx.restore();
      return;
    }
    case "box": {
      A();
      if (e <= 0) return;
      const w = W * e;
      const h = H * e;
      const x = (W - w) / 2;
      const y = (H - h) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      B();
      ctx.restore();
      const bw = W * 0.014 * (1 - e);
      if (bw > 0.3) {
        ctx.save();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = bw;
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = W * 0.03;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }
      return;
    }

    // ---------- 3d ----------
    case "cubev": {
      // A cube turning up: the current face folds away at the top as the next opens from below.
      const split = H * (1 - e);
      black();
      ctx.save();
      ctx.scale(1, Math.max(0.001, split / H));
      A();
      ctx.fillStyle = `rgba(0,0,0,${0.55 * e})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.translate(0, split);
      ctx.scale(1, Math.max(0.001, (H - split) / H));
      B();
      ctx.fillStyle = `rgba(0,0,0,${0.55 * (1 - e)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "flipv": {
      black();
      const sy = Math.max(0.001, Math.abs(Math.cos(e * Math.PI)));
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(1 - 0.06 * (1 - sy), sy);
      ctx.translate(-W / 2, -H / 2);
      cut();
      ctx.fillStyle = `rgba(0,0,0,${0.55 * (1 - sy)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "door": {
      B();
      dim(0.6 * (1 - e));
      const theta = e * Math.PI * 0.5;
      if (theta >= Math.PI * 0.499) return;
      if (theta <= 0.001) {
        A();
        return;
      }
      const la = layer(2, W, H);
      A(la);
      hinge(ctx, la.canvas, W, H, dir > 0 ? "left" : "right", theta, 0.65 * Math.sin(theta));
      return;
    }
    case "page": {
      const f = W * (1 - e);
      B();
      if (f <= 0.5) return;
      // Shadow the turning page throws on the next one.
      const sw = W * 0.1;
      const sg = ctx.createLinearGradient(f, 0, f + sw, 0);
      sg.addColorStop(0, `rgba(0,0,0,${0.5 * Math.min(1, pulse * 2)})`);
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(f, 0, sw, H);
      const la = layer(2, W, H);
      A(la);
      ctx.drawImage(la.canvas, 0, 0, f, H, 0, 0, f, H);
      // The flap: the part past the fold, mirrored over it, seen from the back.
      const flap = Math.min(W - f, f);
      if (flap > 0.5) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(f - flap, 0, flap, H);
        ctx.clip();
        ctx.translate(2 * f, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(la.canvas, f, 0, flap, H, f, 0, flap, H);
        ctx.restore();
        const bg = ctx.createLinearGradient(f - flap, 0, f, 0);
        bg.addColorStop(0, "rgba(250,248,244,0.78)");
        bg.addColorStop(0.75, "rgba(235,232,226,0.82)");
        bg.addColorStop(1, "rgba(150,148,144,0.9)");
        ctx.fillStyle = bg;
        ctx.fillRect(f - flap, 0, flap, H);
        const eg = ctx.createLinearGradient(f - flap - W * 0.04, 0, f - flap, 0);
        eg.addColorStop(0, "rgba(0,0,0,0)");
        eg.addColorStop(1, "rgba(0,0,0,0.35)");
        ctx.fillStyle = eg;
        ctx.fillRect(f - flap - W * 0.04, 0, W * 0.04, H);
      }
      return;
    }
    case "tumble": {
      black();
      const a = clamp01(q / 0.7);
      if (a < 1) {
        xf(0, 0, 1 - 0.65 * easeInOut(a), dir * 0.5 * easeIn(a), () => {
          A();
          dim(0.8 * a);
        }, 1 - easeIn(a));
      }
      const b = clamp01((q - 0.3) / 0.7);
      if (b > 0) {
        xf(0, 0, 0.55 + 0.45 * easeOut(b), 0, () => B(), easeOut(b));
      }
      return;
    }
    case "carousel": {
      black();
      const off = W * 0.85;
      ctx.save();
      ctx.translate(W / 2 - dir * e * off, H / 2);
      ctx.scale((1 - 0.3 * e) * (1 - 0.25 * e), 1 - 0.3 * e);
      ctx.translate(-W / 2, -H / 2);
      A();
      ctx.fillStyle = `rgba(0,0,0,${0.6 * e})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.translate(W / 2 + dir * (1 - e) * off, H / 2);
      ctx.scale((0.7 + 0.3 * e) * (0.75 + 0.25 * e), 0.7 + 0.3 * e);
      ctx.translate(-W / 2, -H / 2);
      B();
      ctx.fillStyle = `rgba(0,0,0,${0.6 * (1 - e)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "fold": {
      B();
      dim(0.6 * (1 - e));
      const hh = (H / 2) * Math.cos(e * Math.PI * 0.5);
      if (hh <= 0.5) return;
      const la = layer(2, W, H);
      A(la);
      ctx.drawImage(la.canvas, 0, 0, W, H / 2, 0, H / 2 - hh, W, hh);
      ctx.drawImage(la.canvas, 0, H / 2, W, H / 2, 0, H / 2, W, hh);
      const g = ctx.createLinearGradient(0, H / 2 - hh, 0, H / 2 + hh);
      const s = 0.7 * e;
      g.addColorStop(0, `rgba(0,0,0,${s})`);
      g.addColorStop(0.5, `rgba(0,0,0,${s * 0.3})`);
      g.addColorStop(1, `rgba(0,0,0,${s})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, H / 2 - hh, W, hh * 2);
      return;
    }
    case "swing": {
      A();
      dim(0.5 * clamp01(q * 1.5));
      // Swings down past its rest and back a little, settling at q = 1.
      // Falls like a hinged board (gravity, faster and faster) until q = 0.55, then swings past
      // its rest towards the viewer and back.
      const angle = q < 0.55 ? (Math.PI / 2) * (1 - Math.pow(q / 0.55, 2)) : -0.32 * Math.sin(((q - 0.55) / 0.45) * Math.PI) * (1 - (q - 0.55) / 0.45);
      if (Math.abs(angle) >= Math.PI * 0.499) return;
      if (Math.abs(angle) <= 0.001) {
        B();
        return;
      }
      const lb = layer(2, W, H);
      B(lb);
      hinge(ctx, lb.canvas, W, H, "top", angle, 0.55 * Math.max(0, Math.sin(angle)));
      return;
    }
    case "tunnel": {
      xf(0, 0, 1.35 - 0.35 * easeOut(q), 0, () => {
        B();
        dim(0.75 * (1 - e));
      });
      const s = 1 - easeIn(q);
      if (s > 0.005) {
        const la = layer(2, W, H);
        A(la);
        const ring = Math.min(1, q * 4);
        for (let i = 0; i < 3; i++) {
          const si = s * Math.pow(0.62, i);
          const w = W * si;
          const h = H * si;
          ctx.save();
          ctx.globalAlpha = i === 0 ? 1 : ring * 0.85;
          ctx.drawImage(la.canvas, (W - w) / 2, (H - h) / 2, w, h);
          ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, 0.5 * q + 0.22 * i)})`;
          ctx.fillRect((W - w) / 2, (H - h) / 2, w, h);
          ctx.restore();
        }
      }
      if (pulse > 0.01) {
        const g = ctx.createRadialGradient(W / 2, H / 2, hyp * 0.2, W / 2, H / 2, hyp);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${0.75 * pulse})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      return;
    }
    case "spin": {
      black();
      if (q < 0.5) {
        const a = easeIn(q * 2);
        xf(0, 0, 1 - 0.5 * a, dir * a * Math.PI * 0.5, () => {
          A();
          dim(0.6 * a);
        });
      } else {
        const b = easeOut((q - 0.5) * 2);
        xf(0, 0, 0.5 + 0.5 * b, -dir * (1 - b) * Math.PI * 0.5, () => {
          B();
          dim(0.6 * (1 - b));
        });
      }
      return;
    }

    // ---------- motion ----------
    case "spinblur": {
      const first = q < 0.5;
      const amt = first ? easeIn(q * 2) : 1 - easeOut((q - 0.5) * 2);
      const angle = dir * (first ? amt : -amt) * Math.PI * 0.5;
      const lg = layer(2, W, H);
      cut(lg);
      const draw = (a: number, alpha: number) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(W / 2, H / 2);
        ctx.rotate(a);
        const s = coverScale(W, H, a);
        ctx.scale(s, s);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(lg.canvas, 0, 0);
        ctx.restore();
      };
      draw(angle, 1);
      if (amt > 0.02) {
        for (let i = 1; i <= 4; i++) {
          draw(angle - dir * (first ? 1 : -1) * i * 0.06 * amt, 0.28);
        }
      }
      return;
    }
    case "bounce": {
      A();
      dim(0.35 * clamp01(q * 2));
      const y = -H * (1 - bounceOut(q));
      ctx.save();
      ctx.shadowColor = `rgba(0,0,0,${0.55 * Math.min(1, q * 5)})`;
      ctx.shadowBlur = W * 0.05;
      ctx.shadowOffsetY = W * 0.02;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, y, W, H);
      ctx.restore();
      ctx.save();
      ctx.translate(0, y);
      B();
      ctx.restore();
      return;
    }
    case "elastic": {
      A();
      dim(0.35 * clamp01(q * 2));
      const s = Math.max(0.001, elasticOut(q));
      xf(0, 0, s, 0, () => B(), Math.min(1, q * 5));
      return;
    }
    case "pulse": {
      const beat = Math.abs(Math.sin(q * Math.PI * 3));
      const s = 1 + 0.07 * beat;
      xf(0, 0, s, 0, () => A());
      xf(0, 0, s, 0, () => B(), e);
      const flash = 0.16 * Math.pow(beat, 4) * pulse;
      if (flash > 0.005) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,255,255,${flash})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      return;
    }
    case "dolly": {
      xf(0, 0, 1 + 0.8 * easeIn(q), 0, () => A());
      xf(0, 0, 0.85 + 0.15 * easeOut(q), 0, () => B(), e);
      if (pulse > 0.01) {
        const g = ctx.createRadialGradient(W / 2, H / 2, hyp * 0.4, W / 2, H / 2, hyp);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${0.5 * pulse})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      return;
    }
    case "parallax": {
      xf(-dir * 0.15 * W * e, 0, 1 + 0.3 * e, 0, () => A());
      xf(dir * 0.15 * W * (1 - e), 0, 1 + 0.3 * (1 - e), 0, () => B(), e);
      return;
    }
    case "pop": {
      A();
      dim(0.4 * clamp01(q * 2));
      const s = q < 0.6 ? 1.08 * easeOut(q / 0.6) : 1.08 - 0.08 * easeInOut((q - 0.6) / 0.4);
      if (s <= 0.001) return;
      xf(0, 0, s, 0, () => {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = W * 0.06;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        B();
      }, Math.min(1, q * 5));
      return;
    }
    case "hshake": {
      const x = Math.sin(q * Math.PI * 9) * W * 0.07 * pulse;
      const lg = layer(2, W, H);
      cut(lg);
      const s = 1 + 0.16 * Math.min(1, pulse * 3);
      const draw = (dx: number, alpha: number) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(W / 2 + dx, H / 2);
        ctx.scale(s, s);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(lg.canvas, 0, 0);
        ctx.restore();
      };
      draw(x, 1);
      if (pulse > 0.05) {
        draw(x + W * 0.03 * pulse, 0.3);
        draw(x - W * 0.03 * pulse, 0.3);
      }
      return;
    }
    case "punch": {
      if (q < 0.4) xf(0, 0, 1 + 0.5 * easeIn(q / 0.4), 0, () => A());
      else xf(0, 0, 1.25 - 0.25 * easeOut((q - 0.4) / 0.6), 0, () => B());
      return;
    }
    case "roll": {
      A();
      dim(0.4 * e);
      const t = 1 - easeOut(q);
      ctx.save();
      ctx.translate(W / 2 + dir * W * 1.7 * t, H / 2);
      ctx.rotate(dir * t * 1.2);
      ctx.translate(-W / 2, -H / 2);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = W * 0.05;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      B();
      ctx.restore();
      return;
    }
  }
}
