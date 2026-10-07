import type { ReelTransition } from "./templates";
import { clamp01, drawBlurred, drawGrain, drawSegment, easeIn, easeInOut, easeOut, layer, rand, roundRectPath, type Scene } from "./scene";

// The move from segment k (at progress p) to segment k+1, q = 0-1 through the transition.
// `salt` makes the random parts (direction, glitch slices, the torn shape) differ between
// transitions but stay the same on every frame of the same one.
export function drawTransition(ctx: CanvasRenderingContext2D, sc: Scene, kind: ReelTransition, k: number, p: number, q: number, salt: number) {
  const { W, H } = sc;
  const e = easeInOut(q);
  const A = (c: CanvasRenderingContext2D = ctx) => drawSegment(c, sc, k, p);
  const B = (c: CanvasRenderingContext2D = ctx) => drawSegment(c, sc, k + 1, 0);
  const dir = rand(salt, 7) < 0.5 ? 1 : -1;
  const pulse = 1 - Math.abs(q - 0.5) * 2;

  switch (kind) {
    case "fade": {
      A();
      ctx.save();
      ctx.globalAlpha = e;
      B();
      ctx.restore();
      return;
    }
    case "slide":
    case "push": {
      const horizontal = kind === "slide";
      const size = horizontal ? W : H;
      ctx.save();
      if (horizontal) ctx.translate(dir * e * size, 0);
      else ctx.translate(0, -e * size);
      A();
      ctx.restore();
      ctx.save();
      if (horizontal) ctx.translate(dir * (e - 1) * size, 0);
      else ctx.translate(0, (1 - e) * size);
      B();
      ctx.restore();
      return;
    }
    case "zoom": {
      B();
      ctx.save();
      ctx.globalAlpha = 1 - e;
      ctx.translate(W / 2, H / 2);
      ctx.scale(1 + 0.35 * e, 1 + 0.35 * e);
      ctx.translate(-W / 2, -H / 2);
      A();
      ctx.restore();
      return;
    }
    case "dipblack":
    case "dipwhite":
    case "flash": {
      if (q < 0.5) A();
      else B();
      const peak = kind === "flash" ? 0.85 : 1;
      ctx.fillStyle = kind === "dipblack" ? `rgba(0,0,0,${pulse})` : kind === "dipwhite" ? `rgba(255,246,228,${peak * Math.pow(pulse, 0.7)})` : `rgba(255,255,255,${peak * pulse})`;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    case "blur": {
      drawBlurred(ctx, sc, k, p, clamp01(q * 1.8));
      ctx.save();
      ctx.globalAlpha = easeInOut(clamp01((q - 0.3) / 0.4));
      drawBlurred(ctx, sc, k + 1, 0, clamp01((1 - q) * 1.8));
      ctx.restore();
      return;
    }
    case "leak": {
      A();
      ctx.save();
      ctx.globalAlpha = e;
      B();
      ctx.restore();
      // Warm light sweeping across, strongest in the middle of the move.
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const x = W * (-0.2 + 1.4 * q);
      const spots: [number, number, string][] = [
        [x, H * 0.35, "255,170,90"],
        [W - x, H * 0.7, "255,95,70"],
      ];
      for (const [cx, cy, rgb] of spots) {
        const r = Math.max(W, H) * 0.55;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${rgb},${0.85 * pulse})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      return;
    }
    case "glitch": {
      const step = Math.floor(q * 14);
      const src = q < 0.5 ? A : B;
      src();
      const lg = layer(1, W, H);
      (rand(salt, step, 3) < 0.5 ? A : B)(lg);
      const slices = 7;
      for (let i = 0; i < slices; i++) {
        if (rand(salt, step, i, 11) > 0.55 + 0.4 * (1 - pulse)) continue;
        const y = rand(salt, step, i, 12) * H;
        const h = H * (0.02 + rand(salt, step, i, 13) * 0.09);
        const dx = (rand(salt, step, i, 14) - 0.5) * W * 0.22 * pulse;
        ctx.drawImage(lg.canvas, 0, y, W, h, dx, y, W, h);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = i % 2 ? `rgba(255,0,90,${0.35 * pulse})` : `rgba(0,230,255,${0.3 * pulse})`;
        ctx.fillRect(dx * 0.4, y, W, h);
        ctx.restore();
      }
      return;
    }
    case "grain": {
      A();
      ctx.save();
      ctx.globalAlpha = e;
      B();
      ctx.restore();
      drawGrain(ctx, W, H, q * 3 + salt, 0.55 * pulse, Math.max(1, W / 360));
      return;
    }
    case "circle":
    case "blob":
    case "diagonal": {
      A();
      ctx.save();
      ctx.beginPath();
      const hyp = Math.hypot(W, H) / 2;
      if (kind === "circle") {
        ctx.arc(W / 2, H / 2, e * hyp * 1.02, 0, Math.PI * 2);
      } else if (kind === "blob") {
        // A torn, uneven hole that grows from the middle.
        const n = 22;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const r = e * hyp * 1.35 * (0.78 + 0.32 * rand(salt, i % n, 21));
          const x = W / 2 + Math.cos(a) * r;
          const y = H / 2 + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        // A diagonal edge sweeping across the frame.
        const span = W + H;
        const d = e * span * 1.05;
        if (dir > 0) {
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.min(d, W), 0);
          ctx.lineTo(Math.max(0, d - H), d > H ? H : d);
          if (d > H) ctx.lineTo(0, H);
        } else {
          ctx.moveTo(W, H);
          ctx.lineTo(W - Math.min(d, W), H);
          ctx.lineTo(W - Math.max(0, d - H), d > H ? 0 : H - d);
          if (d > H) ctx.lineTo(W, 0);
        }
      }
      ctx.closePath();
      ctx.clip();
      B();
      ctx.restore();
      return;
    }
    case "edges": {
      // The next photo shows through a soft oval that opens up (faded edges).
      A();
      const lg = layer(1, W, H);
      B(lg);
      const r = Math.hypot(W, H) * (0.05 + 0.75 * e);
      const g = lg.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      lg.globalCompositeOperation = "destination-in";
      lg.fillStyle = g;
      lg.fillRect(0, 0, W, H);
      ctx.drawImage(lg.canvas, 0, 0);
      if (q > 0.85) {
        ctx.save();
        ctx.globalAlpha = (q - 0.85) / 0.15;
        B();
        ctx.restore();
      }
      return;
    }
    case "tiles": {
      A();
      const cols = 2;
      const rows = H > W * 1.3 ? 3 : 2;
      const cw = W / cols;
      const ch = H / rows;
      let i = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++, i++) {
          const delay = (i / (cols * rows)) * 0.45;
          const local = easeOut(clamp01((q - delay) / 0.55));
          if (local <= 0) continue;
          const s = 0.55 + 0.45 * local;
          ctx.save();
          ctx.globalAlpha = Math.min(1, local * 1.6);
          ctx.translate(c * cw + cw / 2, r * ch + ch / 2);
          ctx.scale(s, s);
          ctx.translate(-(c * cw + cw / 2), -(r * ch + ch / 2));
          ctx.beginPath();
          ctx.rect(c * cw, r * ch, cw, ch);
          ctx.clip();
          B();
          ctx.restore();
        }
      }
      return;
    }
    case "flip": {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const first = q < 0.5;
      const sx = Math.max(0.001, Math.abs(Math.cos(e * Math.PI)));
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(sx, 1 - 0.06 * (1 - sx));
      ctx.translate(-W / 2, -H / 2);
      if (first) A();
      else B();
      ctx.fillStyle = `rgba(0,0,0,${0.55 * (1 - sx)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "cube": {
      // Two faces of a turning cube: the current one folds away to one side as the next opens.
      const split = dir > 0 ? W * (1 - e) : W * e;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      if (dir > 0) {
        ctx.translate(0, 0);
        ctx.scale(Math.max(0.001, split / W), 1);
      } else {
        ctx.translate(split, 0);
        ctx.scale(Math.max(0.001, (W - split) / W), 1);
      }
      A();
      ctx.fillStyle = `rgba(0,0,0,${0.5 * e})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.save();
      if (dir > 0) {
        ctx.translate(split, 0);
        ctx.scale(Math.max(0.001, (W - split) / W), 1);
      } else {
        ctx.scale(Math.max(0.001, split / W), 1);
      }
      B();
      ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - e)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "rotate": {
      // The next photo turns into place as a white-bordered print, then fills the frame.
      A();
      ctx.fillStyle = `rgba(0,0,0,${0.35 * e})`;
      ctx.fillRect(0, 0, W, H);
      const s = 0.62 + 0.38 * easeOut(q);
      const angle = (1 - easeOut(q)) * dir * 0.32;
      const border = W * 0.025 * (1 - e);
      ctx.save();
      ctx.globalAlpha = Math.min(1, q * 3);
      ctx.translate(W / 2, H / 2);
      ctx.rotate(angle);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = W * 0.05;
      ctx.fillStyle = "#fff";
      ctx.fillRect(-border, -border, W + 2 * border, H + 2 * border);
      ctx.restore();
      B();
      ctx.restore();
      return;
    }
    case "shake": {
      const step = Math.floor(q * 30);
      const amp = W * 0.035 * pulse;
      ctx.save();
      ctx.translate(W / 2 + (rand(salt, step, 1) - 0.5) * 2 * amp, H / 2 + (rand(salt, step, 2) - 0.5) * 2 * amp);
      ctx.rotate((rand(salt, step, 3) - 0.5) * 0.06 * pulse);
      ctx.scale(1.08, 1.08);
      ctx.translate(-W / 2, -H / 2);
      if (q < 0.5) A();
      else B();
      ctx.restore();
      return;
    }
    case "slam": {
      // The next photo drops in from large, lands with a jolt and a flash.
      A();
      const fall = clamp01(q / 0.55);
      const s = 1 + 0.9 * (1 - easeIn(fall));
      const after = clamp01((q - 0.55) / 0.45);
      const jolt = q > 0.55 ? (1 - after) * W * 0.03 : 0;
      const step = Math.floor(q * 30);
      ctx.save();
      ctx.globalAlpha = Math.min(1, fall * 1.4);
      ctx.translate(W / 2 + (rand(salt, step, 5) - 0.5) * 2 * jolt, H / 2 + (rand(salt, step, 6) - 0.5) * 2 * jolt);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
      B();
      ctx.restore();
      if (q > 0.55) {
        ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - after)})`;
        ctx.fillRect(0, 0, W, H);
      }
      return;
    }
    case "zoomblur": {
      // Streaks out of the centre: the current photo rushes forward, the next settles back.
      const first = q < 0.5;
      const amt = first ? q * 2 : (1 - q) * 2;
      const draw = first ? A : B;
      const lg = layer(1, W, H);
      draw(lg);
      ctx.drawImage(lg.canvas, 0, 0);
      const copies = 5;
      for (let i = 1; i <= copies; i++) {
        const s = 1 + (i / copies) * 0.5 * amt;
        ctx.save();
        ctx.globalAlpha = 0.28 * amt;
        ctx.translate(W / 2, H / 2);
        ctx.scale(s, s);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(lg.canvas, 0, 0);
        ctx.restore();
      }
      ctx.fillStyle = `rgba(255,255,255,${0.25 * amt * amt})`;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    case "trio": {
      // The next photo comes in as a card from the middle, with two cards fanned behind it.
      A();
      ctx.fillStyle = `rgba(0,0,0,${0.45 * Math.min(1, q * 2)})`;
      ctx.fillRect(0, 0, W, H);
      const s = 0.5 + 0.5 * easeInOut(q);
      const radius = W * 0.05 * (1 - e);
      for (const side of [-1, 1]) {
        const fan = (1 - e) * 0.6;
        if (fan <= 0.02) continue;
        ctx.save();
        ctx.globalAlpha = fan;
        ctx.translate(W / 2, H / 2);
        ctx.rotate(side * 0.12);
        ctx.scale(s * 0.92, s * 0.92);
        ctx.translate(-W / 2 + side * W * 0.08, -H / 2);
        roundRectPath(ctx, 0, 0, W, H, radius / s);
        ctx.clip();
        B();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = W * 0.06;
      ctx.fillStyle = "#000";
      roundRectPath(ctx, 0, 0, W, H, radius / s);
      ctx.fill();
      ctx.shadowColor = "transparent";
      roundRectPath(ctx, 0, 0, W, H, radius / s);
      ctx.clip();
      B();
      ctx.restore();
      return;
    }
  }
}
