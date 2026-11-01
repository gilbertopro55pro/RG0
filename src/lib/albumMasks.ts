// 77 photo mask effects for the album editor's "מסכות" tool. Every mask is a single self-contained
// SVG string (viewBox 0-100, white shapes/gradients on a transparent background, using opacity —
// never color luminance — to encode "how visible") so the exact same string can be used two ways
// without any duplicated logic:
//  - live preview: set directly as the photo <img>'s CSS mask-image (data URI), mask-type "alpha".
//  - export (JPG/PSD/PDF): rasterized via sharp to a WxH PNG and composited onto the photo buffer
//    with a "dest-in" blend, so the exported file matches the on-screen preview exactly.
// Shapes are authored in a 100x100 square and stretched to fill whatever frame they're dropped on
// (mask-size/resize: 100% 100%) — a "circle" becomes an ellipse in a non-square frame, matching how
// shape-based image masking behaves in most design tools by default.

export type AlbumMask = { id: string; label: string; svg: string };

// The exact same SVG string used server-side (rasterized by sharp for exports) works here directly
// as a CSS mask-image data URI — no separate "preview version" of each mask to keep in sync.
export function maskCssUrl(svgString: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svgString)}")`;
}

export function findMask(maskId: string | undefined): AlbumMask | undefined {
  return maskId ? ALBUM_MASKS.find((m) => m.id === maskId) : undefined;
}

function svg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${inner}</svg>`;
}

// A linear fade along one axis. `angle` is 0 (left→right) or 90 (top→bottom) — both are exact
// under non-uniform stretch since they're pure axis rotations of a square gradient space, unlike
// diagonals (which drift slightly when stretched to a non-square frame — an acceptable look here,
// not a precision tool).
function linearFade(stops: { offset: number; opacity: number }[], angle: 0 | 90 | 45 | 135 = 0): string {
  const stopsXml = stops.map((s) => `<stop offset="${s.offset}%" stop-color="#fff" stop-opacity="${s.opacity}"/>`).join("");
  return svg(
    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform="rotate(${angle} 50 50)">${stopsXml}</linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>`
  );
}

function fadeRight(pct: number): string {
  return linearFade([{ offset: 0, opacity: 1 }, { offset: 100 - pct, opacity: 1 }, { offset: 100, opacity: 0 }]);
}
function fadeLeft(pct: number): string {
  return linearFade([{ offset: 0, opacity: 0 }, { offset: pct, opacity: 1 }, { offset: 100, opacity: 1 }]);
}
function fadeBothSides(pct: number): string {
  return linearFade([
    { offset: 0, opacity: 0 },
    { offset: pct, opacity: 1 },
    { offset: 100 - pct, opacity: 1 },
    { offset: 100, opacity: 0 },
  ]);
}
function fadeTop(pct: number): string {
  return linearFade([{ offset: 0, opacity: 0 }, { offset: pct, opacity: 1 }, { offset: 100, opacity: 1 }], 90);
}
function fadeBottom(pct: number): string {
  return linearFade([{ offset: 0, opacity: 1 }, { offset: 100 - pct, opacity: 1 }, { offset: 100, opacity: 0 }], 90);
}
function fadeTopAndBottom(pct: number): string {
  return linearFade(
    [
      { offset: 0, opacity: 0 },
      { offset: pct, opacity: 1 },
      { offset: 100 - pct, opacity: 1 },
      { offset: 100, opacity: 0 },
    ],
    90
  );
}
function diagonalFade(reverse: boolean): string {
  return linearFade([{ offset: 0, opacity: reverse ? 0 : 1 }, { offset: 100, opacity: reverse ? 1 : 0 }], reverse ? 135 : 45);
}

function radialVignette(innerStop: number, outerStop: number): string {
  return svg(
    `<defs><radialGradient id="g" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#fff" stop-opacity="1"/><stop offset="${innerStop}%" stop-color="#fff" stop-opacity="1"/><stop offset="${outerStop}%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>`
  );
}
function invertedVignette(): string {
  return svg(
    `<defs><radialGradient id="g" cx="50%" cy="50%" r="65%"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="55%" stop-color="#fff" stop-opacity="0"/><stop offset="100%" stop-color="#fff" stop-opacity="1"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>`
  );
}
function cornerFade(cx: number, cy: number): string {
  return svg(
    `<defs><radialGradient id="g" cx="${cx}%" cy="${cy}%" r="45%"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="60%" stop-color="#fff" stop-opacity="0"/><stop offset="100%" stop-color="#fff" stop-opacity="1"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>`
  );
}
function softRectVignette(): string {
  return svg(
    `<defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter></defs><rect x="8" y="8" width="84" height="84" fill="#fff" filter="url(#b)"/>`
  );
}
function roundedCorners(r: number): string {
  return svg(`<rect x="0" y="0" width="100" height="100" rx="${r}" ry="${r}" fill="#fff"/>`);
}

function ellipseShape(rx: number, ry: number): string {
  return svg(`<ellipse cx="50" cy="50" rx="${rx}" ry="${ry}" fill="#fff"/>`);
}

function starPoints(spikes: number, outerR: number, innerR: number, rotDeg = -90): string {
  const pts: string[] = [];
  const step = Math.PI / spikes;
  let angle = (rotDeg * Math.PI) / 180;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${(50 + r * Math.cos(angle)).toFixed(2)},${(50 + r * Math.sin(angle)).toFixed(2)}`);
    angle += step;
  }
  return pts.join(" ");
}
function starShape(spikes: number, outerR: number, innerR: number): string {
  return svg(`<polygon points="${starPoints(spikes, outerR, innerR)}" fill="#fff"/>`);
}

function polygonPoints(sides: number, r: number, rotDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = ((rotDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(angle)).toFixed(2)},${(50 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}
function polygonShape(sides: number, r: number, rotDeg = -90): string {
  return svg(`<polygon points="${polygonPoints(sides, r, rotDeg)}" fill="#fff"/>`);
}

function pathShape(d: string): string {
  return svg(`<path d="${d}" fill="#fff"/>`);
}

function pattern(width: number, height: number, inner: string): string {
  return svg(
    `<defs><pattern id="p" width="${width}" height="${height}" patternUnits="userSpaceOnUse">${inner}</pattern></defs><rect width="100" height="100" fill="url(#p)"/>`
  );
}
function bandedFade(bandOpacities: number[], angle: 0 | 90 | 45 | 135): string {
  const n = bandOpacities.length;
  const stops: { offset: number; opacity: number }[] = [];
  bandOpacities.forEach((op, i) => {
    const start = (i / n) * 100;
    const end = ((i + 1) / n) * 100;
    stops.push({ offset: start, opacity: op }, { offset: end - 1.5, opacity: op }, { offset: end, opacity: bandOpacities[i + 1] ?? op });
  });
  return linearFade(stops, angle);
}


// --- Creative masks (owner, 2026-11-01: "עוד 20 מסכות יצירתיות") ---------------------------------
// Only what both renderers draw the same: paths, gradients, patterns, <mask> (luminance: black
// hides) and a Gaussian blur. Anything "random" (a brush's bristles, torn paper, bokeh) comes from a
// fixed seed, so the mask is the same string on screen and in every export.

function seeded(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
const f1 = (n: number) => n.toFixed(1);

// A shape minus some other shapes: white keeps, black cuts (an SVG <mask>).
function cutOut(keep: string, cuts: string): string {
  return svg(`<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#000"/><g fill="#fff">${keep}</g><g fill="#000">${cuts}</g></mask></defs><rect width="100" height="100" fill="#fff" mask="url(#m)"/>`);
}

function blurred(inner: string, deviation: number): string {
  return svg(`<defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${deviation}"/></filter></defs><g fill="#fff" filter="url(#b)">${inner}</g>`);
}

// A rectangle whose edges are rough: `jag` units in or out, a step every `step` units.
function roughRect(x0: number, y0: number, x1: number, y1: number, jag: number, step: number, seed: number, sides = { top: true, right: true, bottom: true, left: true }): string {
  const r = seeded(seed);
  const off = (on: boolean) => (on ? (r() - 0.5) * 2 * jag : 0);
  const pts: string[] = [];
  for (let x = x0; x < x1; x += step) pts.push(`${f1(x)},${f1(y0 + off(sides.top))}`);
  for (let y = y0; y < y1; y += step) pts.push(`${f1(x1 + off(sides.right))},${f1(y)}`);
  for (let x = x1; x > x0; x -= step) pts.push(`${f1(x)},${f1(y1 + off(sides.bottom))}`);
  for (let y = y1; y > y0; y -= step) pts.push(`${f1(x0 + off(sides.left))},${f1(y)}`);
  return `<polygon points="${pts.join(" ")}"/>`;
}

// A paint stroke across the frame: wavy top and bottom, ragged bristle ends, and a few loose
// bristle streaks past each end.
function brushStroke(): string {
  const r = seeded(7);
  const top: string[] = [];
  const bottom: string[] = [];
  for (let x = 10; x <= 90; x += 4) {
    top.push(`${x},${f1(13 + Math.sin(x / 11) * 2.5 + (r() - 0.5) * 2)}`);
    bottom.push(`${x},${f1(87 + Math.sin(x / 9 + 1) * 2.5 + (r() - 0.5) * 2)}`);
  }
  const right: string[] = [];
  const left: string[] = [];
  for (let y = 15; y < 86; y += 5) {
    right.push(`${f1(90 + r() * 7)},${y}`, `${f1(88 + r() * 3)},${y + 2.5}`);
    left.push(`${f1(10 - r() * 7)},${100 - y}`, `${f1(12 - r() * 3)},${100 - y - 2.5}`);
  }
  const body = `<polygon points="${[...top, ...right, ...bottom.reverse(), ...left].join(" ")}"/>`;
  let streaks = "";
  for (let i = 0; i < 6; i++) {
    const y = 20 + i * 12 + r() * 4;
    streaks += `<rect x="${f1(1 + r() * 4)}" y="${f1(y)}" width="${f1(5 + r() * 5)}" height="${f1(1 + r() * 1.5)}" rx="0.8"/>`;
    streaks += `<rect x="${f1(90 + r() * 3)}" y="${f1(y + 3)}" width="${f1(5 + r() * 5)}" height="${f1(1 + r() * 1.5)}" rx="0.8"/>`;
  }
  return svg(`<g fill="#fff">${body}${streaks}</g>`);
}

// A watercolor blot: an uneven blob with a soft edge, and a few lighter drops around it.
function watercolor(): string {
  const r = seeded(11);
  const pts: string[] = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = 34 + r() * 10;
    pts.push(`${f1(50 + Math.cos(a) * rad)},${f1(50 + Math.sin(a) * rad)}`);
  }
  const drops = [
    [16, 18, 6, 0.75],
    [86, 22, 5, 0.6],
    [84, 82, 7, 0.7],
    [14, 80, 4, 0.55],
  ].map(([cx, cy, rr, op]) => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill-opacity="${op}"/>`).join("");
  return blurred(`<polygon points="${pts.join(" ")}"/>${drops}`, 2.6);
}

// Halftone: solid on one side, dissolving into ever smaller dots toward the other.
function halftone(): string {
  const cols = 12;
  const rows = 12;
  const cell = 100 / cols;
  // The first columns are one solid block (touching circles would leave hairline gaps).
  const solid = 4;
  let dots = `<rect x="0" y="0" width="${f1(solid * cell)}" height="100"/>`;
  for (let c = solid; c < cols; c++) {
    const t = (c - solid + 1) / (cols - solid);
    const rad = cell * 0.7 * (1 - t) + 0.5 * t;
    for (let row = 0; row < rows; row++) dots += `<circle cx="${f1(c * cell + cell / 2)}" cy="${f1(row * (100 / rows) + 100 / rows / 2)}" r="${rad.toFixed(2)}"/>`;
  }
  return svg(`<g fill="#fff">${dots}</g>`);
}

// Pixels melting away: whole on one side, squares dropping out more and more toward the other.
function pixelDissolve(): string {
  const r = seeded(23);
  const n = 12;
  const cell = 100 / n;
  // Squares next to each other in a row are one rect, and every rect runs a little into the next
  // row, so no hairline shows between them.
  const kept = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
  for (let c = 0; c < n; c++) {
    const keep = c < 4 ? 1 : 1 - (c - 3) / (n - 3);
    for (let row = 0; row < n; row++) kept[row][c] = r() < keep;
  }
  let squares = "";
  for (let row = 0; row < n; row++) {
    for (let c = 0; c < n; c++) {
      if (!kept[row][c]) continue;
      let end = c;
      while (end + 1 < n && kept[row][end + 1]) end++;
      const below = row + 1 < n && kept[row + 1][c] ? 0.6 : 0;
      squares += `<rect x="${f1(c * cell)}" y="${f1(row * cell)}" width="${f1((end - c + 1) * cell)}" height="${f1(cell + below)}"/>`;
      c = end;
    }
  }
  return svg(`<g fill="#fff">${squares}</g>`);
}

// Sun rays from the middle: alternating wedges and a solid center.
function sunburst(): string {
  const rays = 12;
  let wedges = "";
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = a0 + Math.PI / rays;
    wedges += `<polygon points="50,50 ${f1(50 + Math.cos(a0) * 90)},${f1(50 + Math.sin(a0) * 90)} ${f1(50 + Math.cos(a1) * 90)},${f1(50 + Math.sin(a1) * 90)}"/>`;
  }
  return svg(`<g fill="#fff">${wedges}<circle cx="50" cy="50" r="16"/></g>`);
}

// Bokeh: overlapping soft circles of different sizes and strengths.
function bokeh(): string {
  const r = seeded(31);
  let circles = "";
  for (let i = 0; i < 26; i++) {
    circles += `<circle cx="${f1(8 + r() * 84)}" cy="${f1(8 + r() * 84)}" r="${f1(7 + r() * 11)}" fill-opacity="${(0.55 + r() * 0.45).toFixed(2)}"/>`;
  }
  return blurred(circles, 0.6);
}

// A film strip: the frame in the middle, and the two sprocket bands with their holes.
function filmStrip(): string {
  let holes = "";
  for (let i = 0; i < 12; i++) {
    const x = 2.2 + i * 8.3;
    holes += `<rect x="${f1(x)}" y="7.5" width="4.4" height="5" rx="1"/><rect x="${f1(x)}" y="87.5" width="4.4" height="5" rx="1"/>`;
  }
  return cutOut(`<rect x="0" y="5" width="100" height="10"/><rect x="0" y="17.5" width="100" height="65"/><rect x="0" y="85" width="100" height="10"/>`, holes);
}

// A postage stamp: a rectangle with perforated edges.
function stamp(): string {
  let holes = "";
  for (let i = 0; i <= 10; i++) {
    const v = 6 + i * 8.8;
    holes += `<circle cx="${f1(v)}" cy="6" r="2.6"/><circle cx="${f1(v)}" cy="94" r="2.6"/><circle cx="6" cy="${f1(v)}" r="2.6"/><circle cx="94" cy="${f1(v)}" r="2.6"/>`;
  }
  return cutOut(`<rect x="6" y="6" width="88" height="88"/>`, holes);
}

function scallopedCircle(): string {
  let bumps = "";
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    bumps += `<circle cx="${f1(50 + Math.cos(a) * 40)}" cy="${f1(50 + Math.sin(a) * 40)}" r="7.6"/>`;
  }
  return svg(`<g fill="#fff"><circle cx="50" cy="50" r="40"/>${bumps}</g>`);
}

function flower(): string {
  let petals = "";
  for (let i = 0; i < 6; i++) petals += `<ellipse cx="50" cy="27" rx="15" ry="24" transform="rotate(${i * 60} 50 50)"/>`;
  return svg(`<g fill="#fff">${petals}<circle cx="50" cy="50" r="16"/></g>`);
}

function heartPattern(): string {
  return pattern(
    16,
    16,
    `<path transform="translate(1.6 1.4) scale(0.64)" d="M10,17 C4,12.5 1.5,9 1.5,6 C1.5,3 4,1.2 6.5,2 C8,2.5 9.2,3.7 10,5.2 C10.8,3.7 12,2.5 13.5,2 C16,1.2 18.5,3 18.5,6 C18.5,9 16,12.5 10,17 Z" fill="#fff"/>`
  );
}

export const ALBUM_MASKS: AlbumMask[] = [
  // The 5 required directional fades.
  { id: "fade-right-25", label: "דהייה ימינה 25%", svg: fadeRight(25) },
  { id: "fade-left-25", label: "דהייה שמאלה 25%", svg: fadeLeft(25) },
  { id: "fade-right-40", label: "דהייה ימינה 40%", svg: fadeRight(40) },
  { id: "fade-left-40", label: "דהייה שמאלה 40%", svg: fadeLeft(40) },
  { id: "fade-both-15", label: "דהייה משני הצדדים 15%", svg: fadeBothSides(15) },
  // Owner, 2026-10-06: 25% from both sides, and the same reversed — clear at the edges, fading out
  // toward the middle (transparent at the center, back to full 25% to each side of it).
  { id: "fade-both-25", label: "דהייה משני הצדדים 25%", svg: fadeBothSides(25) },
  {
    id: "fade-center-25",
    label: "דהייה מהמרכז החוצה 25%",
    svg: linearFade([
      { offset: 0, opacity: 1 },
      { offset: 25, opacity: 1 },
      { offset: 50, opacity: 0 },
      { offset: 75, opacity: 1 },
      { offset: 100, opacity: 1 },
    ]),
  },

  // Creative masks (owner, 2026-11-01).
  { id: "shape-arch", label: "קשת", svg: pathShape("M10,96 L10,42 A40,38 0 0 1 90,42 L90,96 Z") },
  { id: "shape-arch-gothic", label: "קשת מחודדת", svg: pathShape("M12,96 L12,46 C12,26 30,10 50,4 C70,10 88,26 88,46 L88,96 Z") },
  { id: "shape-flower", label: "פרח", svg: flower() },
  { id: "shape-crescent", label: "סהר", svg: cutOut(`<circle cx="50" cy="50" r="44"/>`, `<circle cx="67" cy="40" r="34"/>`) },
  { id: "shape-scalloped", label: "עיגול מסולסל", svg: scallopedCircle() },
  { id: "shape-stamp", label: "בול דואר", svg: stamp() },
  { id: "shape-keyhole", label: "חור מנעול", svg: svg(`<g fill="#fff"><circle cx="50" cy="34" r="24"/><polygon points="37,46 63,46 74,96 26,96"/></g>`) },
  { id: "creative-brush", label: "משיחת מכחול", svg: brushStroke() },
  { id: "creative-watercolor", label: "כתם צבעי מים", svg: watercolor() },
  { id: "creative-deckled", label: "שוליים של נייר בעבודת יד", svg: svg(`<g fill="#fff">${roughRect(5, 5, 95, 95, 1.3, 1.6, 41)}</g>`) },
  { id: "creative-torn-sides", label: "נייר קרוע משני הצדדים", svg: svg(`<g fill="#fff">${roughRect(9, 0, 91, 100, 3.2, 2.6, 53, { top: false, right: true, bottom: false, left: true })}</g>`) },
  { id: "creative-halftone", label: "פיזור נקודות", svg: halftone() },
  { id: "creative-pixels", label: "פיקסלים נמסים", svg: pixelDissolve() },
  {
    id: "creative-triptych",
    label: "שלושה חלונות",
    svg: svg(`<g fill="#fff"><rect x="4" y="4" width="28.7" height="92" rx="1.5"/><rect x="35.65" y="4" width="28.7" height="92" rx="1.5"/><rect x="67.3" y="4" width="28.7" height="92" rx="1.5"/></g>`),
  },
  {
    id: "creative-four",
    label: "ארבעה חלונות",
    svg: svg(`<g fill="#fff"><rect x="4" y="4" width="44.5" height="44.5" rx="1.5"/><rect x="51.5" y="4" width="44.5" height="44.5" rx="1.5"/><rect x="4" y="51.5" width="44.5" height="44.5" rx="1.5"/><rect x="51.5" y="51.5" width="44.5" height="44.5" rx="1.5"/></g>`),
  },
  { id: "creative-sunburst", label: "קרני שמש", svg: sunburst() },
  { id: "creative-bokeh", label: "בועות אור", svg: bokeh() },
  { id: "creative-filmstrip", label: "סרט צילום", svg: filmStrip() },
  { id: "creative-cameo", label: "מדליון רך", svg: blurred(`<ellipse cx="50" cy="50" rx="38" ry="43"/>`, 3.5) },
  { id: "pattern-hearts", label: "לבבות", svg: heartPattern() },

  // More directional fades.
  { id: "fade-top-25", label: "דהייה למעלה 25%", svg: fadeTop(25) },
  { id: "fade-bottom-25", label: "דהייה למטה 25%", svg: fadeBottom(25) },
  { id: "fade-top-40", label: "דהייה למעלה 40%", svg: fadeTop(40) },
  { id: "fade-bottom-40", label: "דהייה למטה 40%", svg: fadeBottom(40) },
  { id: "fade-vert-15", label: "דהייה מלמעלה ומלמטה 15%", svg: fadeTopAndBottom(15) },
  { id: "fade-diag-1", label: "דהייה אלכסונית", svg: diagonalFade(false) },
  { id: "fade-diag-2", label: "דהייה אלכסונית הפוכה", svg: diagonalFade(true) },
  { id: "vignette-soft", label: "ויניאט עגול רך", svg: radialVignette(35, 75) },
  { id: "vignette-hard", label: "ויניאט עגול חד", svg: radialVignette(62, 68) },
  { id: "vignette-rect", label: "ויניאט מרובע רך", svg: softRectVignette() },
  { id: "vignette-inverted", label: "דהייה מהמרכז החוצה", svg: invertedVignette() },
  { id: "corner-fade-tl", label: "פינה שמאלית-עליונה דוהה", svg: cornerFade(0, 0) },
  { id: "corner-fade-br", label: "פינה ימנית-תחתונה דוהה", svg: cornerFade(100, 100) },
  { id: "rounded-corners-soft", label: "פינות מעוגלות עדינות", svg: roundedCorners(10) },
  { id: "rounded-corners-strong", label: "פינות מעוגלות בולטות", svg: roundedCorners(28) },

  // Shape crops.
  { id: "shape-circle", label: "עיגול", svg: ellipseShape(46, 46) },
  { id: "shape-ellipse", label: "אליפסה", svg: ellipseShape(48, 32) },
  { id: "shape-star-5", label: "כוכב 5 קודקודים", svg: starShape(5, 46, 18) },
  { id: "shape-star-6", label: "כוכב 6 קודקודים", svg: starShape(6, 46, 24) },
  { id: "shape-star-8", label: "כוכב 8 קודקודים", svg: starShape(8, 46, 30) },
  { id: "shape-hexagon", label: "משושה", svg: polygonShape(6, 46) },
  { id: "shape-diamond", label: "מעוין", svg: polygonShape(4, 48) },
  { id: "shape-triangle", label: "משולש", svg: polygonShape(3, 50, -90) },
  { id: "shape-pentagon", label: "מחומש", svg: polygonShape(5, 46) },
  {
    id: "shape-heart",
    label: "לב",
    svg: pathShape("M50,90 C20,68 5,46 5,28 C5,12 20,2 35,10 C42,14 47,20 50,28 C53,20 58,14 65,10 C80,2 95,12 95,28 C95,46 80,68 50,90 Z"),
  },
  {
    id: "shape-drop",
    label: "טיפה",
    svg: pathShape("M50,8 C70,34 85,54 85,70 A35,35 0 1 1 15,70 C15,54 30,34 50,8 Z"),
  },
  {
    id: "shape-cloud",
    label: "ענן",
    svg: svg(
      `<ellipse cx="50" cy="62" rx="38" ry="18" fill="#fff"/><circle cx="28" cy="46" r="17" fill="#fff"/><circle cx="52" cy="38" r="21" fill="#fff"/><circle cx="74" cy="47" r="16" fill="#fff"/>`
    ),
  },
  {
    id: "shape-arrow",
    label: "חץ",
    svg: pathShape("M8,38 L55,38 L55,15 L92,50 L55,85 L55,62 L8,62 Z"),
  },
  {
    id: "shape-splash",
    label: "רסס",
    svg: pathShape("M50,4 C76,4 96,25 93,50 C91,73 70,96 44,92 C19,89 4,66 7,40 C9,18 27,4 50,4 Z"),
  },
  {
    id: "shape-ribbon",
    label: "סרט",
    svg: pathShape("M5,18 L95,18 L95,52 L50,80 L5,52 Z"),
  },
  {
    id: "shape-torn",
    label: "קצה קרוע",
    svg: pathShape("M0,14 L9,7 L17,17 L25,5 L33,15 L41,8 L49,18 L57,6 L65,16 L73,9 L81,19 L89,7 L100,14 L100,100 L0,100 Z"),
  },
  {
    id: "shape-leaf",
    label: "עלה",
    svg: pathShape("M14,86 C14,44 44,14 86,14 C86,56 56,86 14,86 Z"),
  },
  {
    id: "shape-shield",
    label: "מגן",
    svg: pathShape("M50,4 L90,18 L90,48 C90,74 70,90 50,96 C30,90 10,74 10,48 L10,18 Z"),
  },
  {
    id: "shape-butterfly",
    label: "פרפר",
    svg: svg(
      `<ellipse cx="30" cy="35" rx="23" ry="17" fill="#fff" transform="rotate(-20 30 35)"/><ellipse cx="70" cy="35" rx="23" ry="17" fill="#fff" transform="rotate(20 70 35)"/><ellipse cx="32" cy="63" rx="16" ry="13" fill="#fff" transform="rotate(-15 32 63)"/><ellipse cx="68" cy="63" rx="16" ry="13" fill="#fff" transform="rotate(15 68 63)"/><rect x="46" y="18" width="8" height="68" rx="4" fill="#fff"/>`
    ),
  },
  {
    id: "shape-rounded-square",
    label: "ריבוע מעוגל",
    svg: svg(`<rect x="6" y="6" width="88" height="88" rx="22" ry="22" fill="#fff"/>`),
  },
  {
    id: "shape-octagon",
    label: "תמנית",
    svg: polygonShape(8, 46, -90),
  },

  // Pattern masks.
  { id: "pattern-vstripes", label: "פסים אנכיים", svg: pattern(10, 100, `<rect x="0" y="0" width="5" height="100" fill="#fff"/>`) },
  { id: "pattern-hstripes", label: "פסים אופקיים", svg: pattern(100, 10, `<rect x="0" y="0" width="100" height="5" fill="#fff"/>`) },
  {
    id: "pattern-diagstripes",
    label: "פסים אלכסוניים",
    svg: svg(
      `<defs><pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect x="0" y="0" width="7" height="14" fill="#fff"/></pattern></defs><rect width="140" height="140" x="-20" y="-20" fill="url(#p)"/>`
    ),
  },
  { id: "pattern-dots", label: "רשת נקודות", svg: pattern(13, 13, `<circle cx="6.5" cy="6.5" r="4.2" fill="#fff"/>`) },
  {
    id: "pattern-checker",
    label: "שחמט",
    svg: pattern(20, 20, `<rect x="0" y="0" width="10" height="10" fill="#fff"/><rect x="10" y="10" width="10" height="10" fill="#fff"/>`),
  },
  {
    id: "pattern-waves",
    label: "גלים",
    svg: pattern(40, 20, `<path d="M0,10 Q10,0 20,10 T40,10" stroke="#fff" stroke-width="8" fill="none"/>`),
  },
  {
    id: "pattern-zigzag",
    label: "זיגזג",
    svg: pattern(20, 20, `<path d="M0,20 L10,2 L20,20" stroke="#fff" stroke-width="6" fill="none"/>`),
  },

  // "Echo"-style banded fades — a stepped, repeating opacity pattern that reads as a layered/ghost-
  // trail effect without needing separate offset copies of the photo.
  { id: "echo-diagonal", label: "הד מדורג אלכסוני", svg: bandedFade([1, 0.7, 0.4, 0.15], 45) },
  { id: "echo-horizontal", label: "הד מדורג אופקי", svg: bandedFade([1, 0.65, 0.35, 0.12], 0) },
  { id: "echo-vertical", label: "הד מדורג אנכי", svg: bandedFade([1, 0.65, 0.35, 0.12], 90) },
  { id: "echo-center-out", label: "הד מהמרכז החוצה", svg: radialVignette(20, 95) },
];
