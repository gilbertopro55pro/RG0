// Generates the illustrated digit elements for the magnet-frame designer ("ספרות" tab):
// public/magnet-elements/digits/<style>-<number>.png, transparent, 800×800.
//
// Each digit's outline comes from one of the app's own bundled fonts (src/assets/fonts), and the
// style (metallic, balloon, cake, script, rainbow, 3D, floral, Star of David) is drawn around it in SVG, then
// rasterized with sharp. Original artwork: the owner's reference only set the kinds of styles.
//
// Run: node scripts/magnet-digits/generate.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import fontkit from "@pdf-lib/fontkit";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "public/magnet-elements/digits");
const SIZE = 800;
export const NUMBERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "13"];
// Styles added later cover only 0–10.
const SHORT = new Set(["swirl", "rainbow", "threeD"]);
export const numbersFor = (style) => (SHORT.has(style) ? NUMBERS.slice(0, 11) : NUMBERS);

const fonts = {};
function font(file) {
  fonts[file] ??= fontkit.create(fs.readFileSync(path.join(ROOT, "src/assets/fonts", file)));
  return fonts[file];
}

// The number's outline as one SVG path, scaled to fit `box` ({x, y, w, h}) and centered in it.
function digitPath(text, fontFile, box) {
  const f = font(fontFile);
  const run = f.layout(text);
  let x = 0;
  const glyphs = run.glyphs.map((g, i) => {
    const placed = { path: g.path, x };
    x += run.positions[i].xAdvance;
    return placed;
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const g of glyphs) {
    const b = g.path.bbox;
    minX = Math.min(minX, b.minX + g.x);
    maxX = Math.max(maxX, b.maxX + g.x);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const s = Math.min(box.w / w, box.h / h);
  const ox = box.x + (box.w - w * s) / 2 - minX * s;
  const oy = box.y + (box.h - h * s) / 2 + maxY * s;
  const d = glyphs.map((g) => g.path.translate(g.x, 0).scale(s, -s).translate(ox, oy).toSVG()).join(" ");
  return { d, bbox: { x: ox + minX * s, y: oy - maxY * s, w: w * s, h: h * s } };
}

// Deterministic pseudo-random, so regenerating gives the same artwork.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);

function star4(cx, cy, r, color) {
  const i = r * 0.28;
  return `<path d="M${cx} ${cy - r} Q${cx + i} ${cy - i} ${cx + r} ${cy} Q${cx + i} ${cy + i} ${cx} ${cy + r} Q${cx - i} ${cy + i} ${cx - r} ${cy} Q${cx - i} ${cy - i} ${cx} ${cy - r}Z" fill="${color}"/>`;
}

const STYLES = {
  // Silver-to-gold metallic serif with a sparkler.
  gold(n) {
    const { d, bbox } = digitPath(n, "AbrilFatface-Latin.ttf", { x: 150, y: 190, w: 500, h: 520 });
    const r = rng(seedOf("gold" + n));
    const sx = bbox.x + bbox.w * 0.78;
    const sy = bbox.y + 10;
    let sparks = "";
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const len = 26 + r() * 30;
      sparks += `<line x1="${sx + Math.cos(a) * 16}" y1="${sy - 70 + Math.sin(a) * 16}" x2="${sx + Math.cos(a) * len}" y2="${sy - 70 + Math.sin(a) * len}" stroke="${i % 2 ? "#f6c945" : "#ffe9a8"}" stroke-width="4" stroke-linecap="round"/>`;
    }
    let dots = "";
    for (let i = 0; i < 16; i++) dots += star4(90 + r() * 620, 120 + r() * 600, 6 + r() * 10, i % 3 ? "#d8b25a" : "#b9bec7");
    return `
      <defs>
        <linearGradient id="m" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f4f5f7"/><stop offset="0.28" stop-color="#b9bec7"/><stop offset="0.46" stop-color="#ffffff"/>
          <stop offset="0.54" stop-color="#e9c46a"/><stop offset="0.75" stop-color="#b8862b"/><stop offset="1" stop-color="#f6dc8c"/>
        </linearGradient>
      </defs>
      ${dots}
      <line x1="${sx}" y1="${sy + 30}" x2="${sx}" y2="${sy - 60}" stroke="#8d8d8d" stroke-width="7" stroke-linecap="round"/>
      ${sparks}<circle cx="${sx}" cy="${sy - 70}" r="10" fill="#fff6c9"/>
      <path d="${d}" fill="#7b5a1c" transform="translate(6 8)" opacity="0.35"/>
      <path d="${d}" fill="url(#m)" stroke="#8a6a2a" stroke-width="5" stroke-linejoin="round"/>`;
  },

  // Puffy glossy balloon digit with confetti stars.
  balloon(n) {
    const { d, bbox } = digitPath(n, "Righteous-Latin.ttf", { x: 150, y: 150, w: 500, h: 520 });
    const r = rng(seedOf("balloon" + n));
    let deco = "";
    const colors = ["#f7b733", "#3cc6e0", "#f062a8", "#8e6cf0"];
    for (let i = 0; i < 9; i++) {
      const x = 70 + r() * 660;
      const y = 80 + r() * 640;
      if (x > bbox.x - 20 && x < bbox.x + bbox.w + 20 && y > bbox.y - 20 && y < bbox.y + bbox.h + 20) continue;
      deco += i % 2 ? star4(x, y, 16 + r() * 12, colors[i % 4]) : `<circle cx="${x}" cy="${y}" r="${6 + r() * 7}" fill="${colors[i % 4]}"/>`;
    }
    return `
      <defs>
        <linearGradient id="b" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#ff5fb0"/><stop offset="0.45" stop-color="#a36bff"/><stop offset="1" stop-color="#3fd6e8"/>
        </linearGradient>
        <clipPath id="c"><path d="${d}"/></clipPath>
      </defs>
      ${deco}
      <path d="${d}" fill="none" stroke="#3a1c4d" stroke-width="44" stroke-linejoin="round"/>
      <path d="${d}" fill="url(#b)" stroke="url(#b)" stroke-width="26" stroke-linejoin="round"/>
      <g clip-path="url(#c)" opacity="0.5">
        <path d="${d}" fill="none" stroke="#ffffff" stroke-width="16" stroke-linejoin="round" transform="translate(-14 -16)"/>
      </g>
      <ellipse cx="${bbox.x + bbox.w * 0.3}" cy="${bbox.y + 40}" rx="18" ry="30" fill="#ffffff" opacity="0.75" transform="rotate(25 ${bbox.x + bbox.w * 0.3} ${bbox.y + 40})"/>`;
  },

  // Sponge with dripping frosting, sprinkles and a candle.
  cake(n) {
    const { d, bbox } = digitPath(n, "Righteous-Latin.ttf", { x: 150, y: 210, w: 500, h: 500 });
    const r = rng(seedOf("cake" + n));
    const frost = ["#f4a3b6", "#a7e0c6", "#b9a7f0"][Number(n) % 3];
    const top = bbox.y - 30;
    const dripY = bbox.y + bbox.h * 0.42;
    let drip = `M0 ${top} H${SIZE} V${dripY}`;
    for (let x = SIZE; x > 0; x -= 50) {
      const deep = dripY + (r() > 0.5 ? 30 + r() * 45 : 8);
      drip += ` Q${x - 12} ${deep} ${x - 25} ${deep - 4} Q${x - 38} ${dripY - 6} ${x - 50} ${dripY}`;
    }
    drip += " Z";
    let sprinkles = "";
    const sc = ["#ffffff", "#f7c948", "#5bc0eb", "#e4572e", "#9bc53d"];
    for (let i = 0; i < 60; i++) {
      const x = bbox.x + r() * bbox.w;
      const y = top + 20 + r() * (dripY - top - 10);
      sprinkles += `<rect x="${x}" y="${y}" width="16" height="5" rx="2.5" fill="${sc[i % 5]}" transform="rotate(${r() * 180} ${x + 8} ${y + 2})"/>`;
    }
    let crumbs = "";
    for (let i = 0; i < 40; i++) crumbs += `<circle cx="${bbox.x + r() * bbox.w}" cy="${dripY + r() * (bbox.h * 0.6)}" r="${2 + r() * 3}" fill="#e8a33c" opacity="0.7"/>`;
    const cx = bbox.x + bbox.w / 2;
    return `
      <defs><clipPath id="c"><path d="${d}"/></clipPath></defs>
      <rect x="${cx - 12}" y="${bbox.y - 120}" width="24" height="100" rx="6" fill="#fff3d6" stroke="#6b3a1e" stroke-width="5"/>
      <path d="M${cx - 12} ${bbox.y - 95} L${cx + 12} ${bbox.y - 110} M${cx - 12} ${bbox.y - 65} L${cx + 12} ${bbox.y - 80} M${cx - 12} ${bbox.y - 35} L${cx + 12} ${bbox.y - 50}" stroke="#f06b8b" stroke-width="6"/>
      <path d="M${cx} ${bbox.y - 185} Q${cx + 24} ${bbox.y - 145} ${cx} ${bbox.y - 128} Q${cx - 24} ${bbox.y - 145} ${cx} ${bbox.y - 185}Z" fill="#ffb627" stroke="#e8601c" stroke-width="4"/>
      <g clip-path="url(#c)">
        <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="#f9d98b"/>${crumbs}
        <path d="${drip}" fill="${frost}"/>${sprinkles}
      </g>
      <path d="${d}" fill="none" stroke="#6b3a1e" stroke-width="12" stroke-linejoin="round"/>`;
  },

  // Script digit in a plum-to-rose gradient with gold flourish curls.
  swirl(n) {
    const { d, bbox } = digitPath(n, "Pacifico-Latin.ttf", { x: 170, y: 150, w: 460, h: 500 });
    const curl = (x, y, s, flip) =>
      `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">
        <path d="M0 0 C40 -10 80 20 70 60 C62 92 22 96 12 72 C4 52 22 38 38 46 C50 52 46 66 36 66" fill="none" stroke="#c9a04e" stroke-width="7" stroke-linecap="round"/>
        <path d="M0 0 C-60 8 -110 -8 -150 -40" fill="none" stroke="#c9a04e" stroke-width="6" stroke-linecap="round"/>
        <path d="M-70 4 C-80 -20 -60 -34 -46 -24" fill="none" stroke="#c9a04e" stroke-width="5" stroke-linecap="round"/>
        <circle cx="-150" cy="-40" r="7" fill="#e6c77e"/>
      </g>`;
    return `
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7a2e6b"/><stop offset="0.55" stop-color="#d0567f"/><stop offset="1" stop-color="#f3a78b"/>
        </linearGradient>
        <clipPath id="c"><path d="${d}"/></clipPath>
      </defs>
      ${curl(bbox.x + bbox.w + 10, bbox.y + bbox.h - 20, 1.25, false)}
      ${curl(bbox.x - 10, bbox.y + 30, 1.1, true)}
      <path d="${d}" fill="#4a1640" transform="translate(7 9)" opacity="0.3"/>
      <path d="${d}" fill="url(#g)" stroke="#c9a04e" stroke-width="9" stroke-linejoin="round"/>
      <g clip-path="url(#c)" opacity="0.45">
        <path d="${d}" fill="none" stroke="#ffffff" stroke-width="10" stroke-linejoin="round" transform="translate(-8 -10)"/>
      </g>`;
  },

  // Bold rounded digit whose color shifts through the rainbow; each number starts on a different hue.
  rainbow(n) {
    const { d } = digitPath(n, "Poppins-Latin.ttf", { x: 160, y: 130, w: 480, h: 540 });
    const start = (Number(n) * 36) % 360;
    const stops = [0, 1, 2, 3, 4, 5]
      .map((k) => `<stop offset="${k / 5}" stop-color="hsl(${(start + k * 60) % 360} 78% 60%)"/>`)
      .join("");
    return `
      <defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>
      <path d="${d}" fill="#2a2140" transform="translate(10 14)" opacity="0.25" stroke="#2a2140" stroke-width="34" stroke-linejoin="round"/>
      <path d="${d}" fill="#ffffff" stroke="#ffffff" stroke-width="34" stroke-linejoin="round"/>
      <path d="${d}" fill="url(#r)" stroke="url(#r)" stroke-width="4" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="#ffffff" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round" opacity="0.8" transform="translate(-3 -3)"/>`;
  },

  // Extruded 3D block digit; the color cycles by number.
  threeD(n) {
    const { d } = digitPath(n, "Montserrat-Latin.ttf", { x: 140, y: 110, w: 470, h: 530 });
    const palettes = [
      ["#5ab8ff", "#1f6fd1", "#0d3a78"],
      ["#ff7a6b", "#d8342a", "#7a1510"],
      ["#6fe0a0", "#1f9e5c", "#0b5230"],
      ["#b99bff", "#6b45d8", "#321a78"],
      ["#ffc15a", "#e0851f", "#7a3f08"],
    ];
    const [light, mid, dark] = palettes[Number(n) % palettes.length];
    let extrude = "";
    for (let i = 36; i >= 1; i--) extrude += `<path d="${d}" fill="${dark}" stroke="${dark}" stroke-width="2" transform="translate(${i * 1.3} ${i * 1.1})"/>`;
    return `
      <defs>
        <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
        <linearGradient id="e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient>
        <linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <clipPath id="c"><path d="${d}"/></clipPath>
      </defs>
      <ellipse cx="420" cy="${700}" rx="260" ry="26" fill="#000" opacity="0.12"/>
      ${extrude}
      <path d="${d}" fill="url(#e)" transform="translate(47 40)" opacity="0.6"/>
      <path d="${d}" fill="url(#f)"/>
      <g clip-path="url(#c)"><rect x="0" y="0" width="${SIZE}" height="300" fill="url(#h)"/></g>`;
  },

  // Blush digit filled with small roses, in a gold outline.
  batmitzva(n) {
    const { d } = digitPath(n, "Lobster-Latin.ttf", { x: 130, y: 120, w: 540, h: 560 });
    return `
      <defs>
        <pattern id="p" width="70" height="70" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
          <rect width="70" height="70" fill="#f7c6cf"/>
          <g transform="translate(20 22)">
            <path d="M-6 8 Q-16 14 -14 2" fill="#9fb89a"/><path d="M6 8 Q16 14 14 2" fill="#9fb89a"/>
            <circle r="11" fill="#e07d92"/><path d="M-6 0 A6 6 0 1 1 5 3 A4 4 0 1 1 -2 -2" fill="none" stroke="#a8435a" stroke-width="2"/>
          </g>
          <g transform="translate(55 55) scale(0.7)">
            <circle r="11" fill="#fbe3e6"/><path d="M-6 0 A6 6 0 1 1 5 3 A4 4 0 1 1 -2 -2" fill="none" stroke="#e08a9c" stroke-width="2.4"/>
          </g>
          <circle cx="52" cy="18" r="3" fill="#e6c07a"/><circle cx="14" cy="56" r="2.5" fill="#e6c07a"/>
        </pattern>
      </defs>
      <path d="${d}" fill="url(#p)" stroke="#c89b5a" stroke-width="18" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="#fff4e8" stroke-width="3" stroke-linejoin="round"/>`;
  },

  // Navy digit with a gold Star-of-David lattice and a gold outline.
  barmitzva(n) {
    const { d } = digitPath(n, "BebasNeue-Latin.ttf", { x: 150, y: 110, w: 500, h: 580 });
    const hex = (cx, cy, r, rot) => {
      const pts = [0, 1, 2].map((k) => {
        const a = rot + (k * 2 * Math.PI) / 3 - Math.PI / 2;
        return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      });
      return `<polygon points="${pts.join(" ")}" fill="none" stroke="#d8b560" stroke-width="2.6" stroke-linejoin="round"/>`;
    };
    const tile = `${hex(30, 30, 18, 0)}${hex(30, 30, 18, Math.PI)}`;
    return `
      <defs>
        <pattern id="s" width="60" height="52" patternUnits="userSpaceOnUse">
          <rect width="60" height="52" fill="#1c2a4a"/>${tile}
          <g transform="translate(-30 26)">${tile}</g><g transform="translate(30 26)">${tile}</g>
        </pattern>
      </defs>
      <path d="${d}" fill="url(#s)" stroke="#c9a84c" stroke-width="14" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="#f1dc9c" stroke-width="3" stroke-linejoin="round"/>`;
  },
};

export const STYLE_KEYS = Object.keys(STYLES);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let bytes = 0;
  let files = 0;
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));
  for (const style of STYLE_KEYS) {
    for (const n of numbersFor(style)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${STYLES[style](n)}</svg>`;
      const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90, effort: 8 }).toBuffer();
      fs.writeFileSync(path.join(OUT, `${style}-${n}.png`), png);
      bytes += png.length;
      files++;
    }
  }
  console.log(`wrote ${files} files, ${(bytes / 1e6).toFixed(2)} MB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  await main();
}
