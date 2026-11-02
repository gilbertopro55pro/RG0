// 80 photo mask effects for the album editor's "מסכות" tool. Every mask is a single self-contained
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

// --- Masks from the owner's reference album (a bat mitzvah book, 2026-11-02) -------------------------

// A regular polygon whose corners are round arcs of radius `corner`, tangent to both sides.
function roundedPolygon(sides: number, r: number, corner: number, rotDeg = -90): string {
  const v = Array.from({ length: sides }, (_, i) => {
    const a = ((rotDeg + (360 / sides) * i) * Math.PI) / 180;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  });
  const edge = 2 * r * Math.sin(Math.PI / sides);
  // How far from each vertex its arc starts, along both sides.
  const cut = corner / Math.tan((Math.PI - (2 * Math.PI) / sides) / 2);
  const toward = (a: number[], b: number[]) =>
    `${(a[0] + ((b[0] - a[0]) * cut) / edge).toFixed(2)},${(a[1] + ((b[1] - a[1]) * cut) / edge).toFixed(2)}`;
  let d = "";
  v.forEach((p, i) => {
    d += `${i === 0 ? "M" : "L"}${toward(p, v[(i + sides - 1) % sides])} A${corner},${corner} 0 0 1 ${toward(p, v[(i + 1) % sides])} `;
  });
  return pathShape(`${d}Z`);
}

// A full circle as a path, so two of them make a ring (evenodd): geometry, not a stroke, so it
// stretches with the frame the same way in both renderers.
function circlePath(cx: number, cy: number, r: number): string {
  return `M${f1(cx - r)},${f1(cy)} A${r},${r} 0 1 0 ${f1(cx + r)},${f1(cy)} A${r},${r} 0 1 0 ${f1(cx - r)},${f1(cy)} Z`;
}
function ringPath(cx: number, cy: number, r0: number, r1: number, opacity: number): string {
  return `<path d="${circlePath(cx, cy, r1)} ${circlePath(cx, cy, r0)}" fill-rule="evenodd" fill-opacity="${opacity}"/>`;
}

// A solid circle and, past a small gap, a translucent ring around it (the reference's cover).
function circleWithRing(): string {
  return svg(`<g fill="#fff"><circle cx="50" cy="50" r="38"/>${ringPath(50, 50, 42, 48, 0.45)}</g>`);
}

// The photo fills the frame up to a wide arc on one side, and past it two thinner translucent bands
// of the photo follow the same curve (a circle centered far off the other side).
function arcBands(side: "right" | "left"): string {
  const cx = side === "right" ? -60 : 160;
  return svg(`<g fill="#fff"><circle cx="${cx}" cy="50" r="146"/>${ringPath(cx, 50, 148.5, 153.5, 0.5)}${ringPath(cx, 50, 155.5, 159, 0.25)}</g>`);
}

// Spray paint / ice: a rectangle whose edges are dense, sharp spikes and notches of uneven depth,
// with a few loose specks just past the edge.
function grungeEdges(): string {
  const r = seeded(61);
  const lo = 4;
  const hi = 96;
  // How far a point sits past the edge line (+ out, - in). The line itself wanders a little, and
  // every other point is a tooth: mostly shallow, now and then a deep spike or notch.
  const phase = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  let tooth = false;
  const offset = (t: number, edge: number) => {
    const wander = Math.sin(t / 7 + phase[edge]) * 0.5 + Math.sin(t / 2.3 + phase[edge] * 2) * 0.3;
    tooth = !tooth;
    if (!tooth) return Math.max(-3.8, Math.min(3.6, wander + (r() - 0.5) * 0.8));
    const depth = 0.5 + Math.pow(r(), 2.4) * 3.5;
    return Math.max(-4, Math.min(3.8, wander + (r() < 0.55 ? depth : -depth)));
  };
  const pts: string[] = [];
  const walk = (edge: number, at: (t: number, off: number) => string) => {
    for (let t = lo; t < hi; t += 0.55 + r() * 0.7) pts.push(at(t, offset(t, edge)));
  };
  walk(0, (t, o) => `${f1(t)},${f1(lo - o)}`);
  walk(1, (t, o) => `${f1(hi + o)},${f1(t)}`);
  walk(2, (t, o) => `${f1(100 - t)},${f1(hi + o)}`);
  walk(3, (t, o) => `${f1(lo - o)},${f1(100 - t)}`);
  let specks = "";
  for (let i = 0; i < 34; i++) {
    const edge = Math.floor(r() * 4);
    const along = lo + r() * (hi - lo);
    const out = 1.2 + r() * 2.2;
    const size = 0.25 + r() * 0.55;
    const [x, y] = edge === 0 ? [along, lo - out] : edge === 1 ? [hi + out, along] : edge === 2 ? [along, hi + out] : [lo - out, along];
    const corners: string[] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + r();
      const rad = size * (0.6 + r() * 0.6);
      corners.push(`${f1(x + Math.cos(a) * rad)},${f1(y + Math.sin(a) * rad)}`);
    }
    specks += `<polygon points="${corners.join(" ")}"/>`;
  }
  return svg(`<g fill="#fff"><polygon points="${pts.join(" ")}"/>${specks}</g>`);
}

// The whole photo with a narrow soft edge: opacity rises from 0 at the frame's edge to full
// `feather` units in (an eased ramp, no hard line), on all four sides.
function softEdges(feather: number): string {
  const ramp = [
    [0, 0],
    [0.25, 0.16],
    [0.5, 0.5],
    [0.75, 0.84],
    [1, 1],
  ];
  const stops = [...ramp, ...ramp.slice().reverse().map(([t, o]) => [100 / feather - t, o])]
    .map(([t, o]) => `<stop offset="${(t * feather).toFixed(2)}%" stop-color="#fff" stop-opacity="${o}"/>`)
    .join("");
  return svg(
    `<defs><linearGradient id="h" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">${stops}</linearGradient><linearGradient id="v" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">${stops}</linearGradient><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="url(#v)"/></mask></defs><rect width="100" height="100" fill="url(#h)" mask="url(#m)"/>`
  );
}

// --- The owner's mask pack, our own versions (2026-11-02) ------------------------------------------
// The owner sent screenshots of a commercial mask pack (grayscale sprites) he has no files or license
// for, so every look below is drawn from scratch as vector shapes, under the same rules as the masks
// above: only what Chromium and librsvg draw the same, and anything random from a fixed seed.

type Pt = [number, number];

// One decimal, no trailing ".0" and no leading zero: some of these masks have hundreds of shapes, and
// the string is a data URI on every masked photo.
const c1 = (n: number) => String(Math.round(n * 10) / 10).replace(/^(-?)0\./, "$1.");
const ptsOf = (p: Pt[]) => p.map(([x, y]) => `${c1(x)},${c1(y)}`).join(" ");
const polyOf = (p: Pt[], attrs = "") => `<polygon points="${ptsOf(p)}"${attrs}/>`;
const circleAt = (x: number, y: number, r: number, attrs = "") => `<circle cx="${c1(x)}" cy="${c1(y)}" r="${c1(r)}"${attrs}/>`;

// A small round dot as a polygon (path data, relative steps). Chromium and librsvg fill straight
// edges the same, but small curves differently (Chromium's come out about a quarter pixel fatter), so
// the masks made of many small dots draw them as polygons.
function dotPath(x: number, y: number, r: number, sides = 10): string {
  let d = `M${c1(x + r)},${c1(y)}`;
  let px = Math.round((x + r) * 10);
  let py = Math.round(y * 10);
  for (let i = 1; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const nx = Math.round((x + Math.cos(a) * r) * 10);
    const ny = Math.round((y + Math.sin(a) * r) * 10);
    d += `${i === 1 ? "l" : " "}${c1((nx - px) / 10)},${c1((ny - py) / 10)}`;
    px = nx;
    py = ny;
  }
  return `${d}z`;
}

// An ellipse as polygon points, for the same reason.
function ovalPts(cx: number, cy: number, rx: number, ry: number, sides = 16): Pt[] {
  return Array.from({ length: sides }, (_, i): Pt => {
    const a = (i / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}

// A wide Gaussian blur. The filter region is the frame and more, so a strong blur is never cut off.
// Two things the renderers don't share: librsvg doesn't blur what lies past the canvas (so blurred
// shapes stay clear of the frame's edge), and a blur under a pixel or so comes out differently.
function softBlur(inner: string, deviation: number): string {
  return svg(
    `<defs><filter id="b" filterUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200"><feGaussianBlur stdDeviation="${deviation}"/></filter></defs><g fill="#fff" filter="url(#b)">${inner}</g>`
  );
}

// Like cutOut, and then more shapes drawn on top, past the cuts.
function cutOutThen(keep: string, cuts: string, after: string): string {
  return svg(
    `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#000"/><g fill="#fff">${keep}</g><g fill="#000">${cuts}</g></mask></defs><rect width="100" height="100" fill="#fff" mask="url(#m)"/><g fill="#fff">${after}</g>`
  );
}

// 0 in the middle of the frame, 1 at its edge, along a rounded square: the "edge" effects follow it,
// so they wrap the corners smoothly.
const edgeDistance = (x: number, y: number) => Math.pow(Math.pow(Math.abs(x - 50) / 48, 4) + Math.pow(Math.abs(y - 50) / 48, 4), 0.25);

// A five-point star (or `spikes`) around cx,cy.
function starAt(cx: number, cy: number, outer: number, inner: number, rotDeg: number, spikes = 5): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = ((rotDeg - 90) * Math.PI) / 180 + (i * Math.PI) / spikes;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// The part of a convex polygon where a*x + b*y <= c.
function clipHalf(poly: Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = a * p[0] + b * p[1] - c;
    const dq = a * q[0] + b * q[1] - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

// A convex polygon shrunk by `g` on every side (each edge moved in, then clipped).
function insetConvex(poly: Pt[], g: number): Pt[] {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  let out = poly;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) continue;
    let nx = (y1 - y0) / len;
    let ny = -(x1 - x0) / len;
    if (nx * (cx - x0) + ny * (cy - y0) > 0) {
      nx = -nx;
      ny = -ny;
    }
    out = clipHalf(out, nx, ny, nx * x0 + ny * y0 - g);
    if (out.length < 3) return [];
  }
  return out;
}

const areaOf = (p: Pt[]) =>
  Math.abs(
    p.reduce((s, [x, y], i) => {
      const [x2, y2] = p[(i + 1) % p.length];
      return s + x * y2 - x2 * y;
    }, 0)
  ) / 2;

function isConvex(p: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i];
    const [bx, by] = p[(i + 1) % p.length];
    const [cx, cy] = p[(i + 2) % p.length];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

// Spray paint: a solid middle with a soft edge, and a fringe of speckles that thins out toward the
// frame's edge. The smallest specks are squares (they're a pixel or two, and a square is a shorter
// string than a circle).
function sprayEdges(): string {
  const r = seeded(101);
  const lo = 15;
  const hi = 85;
  const beyond = (x: number, y: number) => Math.hypot(Math.max(lo - x, 0, x - hi), Math.max(lo - y, 0, y - hi));
  let specks = "";
  let dots = "";
  for (let n = 0, tries = 0; n < 560 && tries < 60000; tries++) {
    const x = r() * 100;
    const y = r() * 100;
    const d = beyond(x, y);
    if (d === 0 || r() > Math.exp(-d / 3.4)) continue;
    const rad = 0.22 + r() * (0.18 + 0.75 * Math.exp(-d / 2.8));
    if (rad < 0.45) {
      const side = rad * 1.77;
      specks += `M${c1(x)},${c1(y)}h${c1(side)}v${c1(side)}h${c1(-side)}z`;
    } else dots += circleAt(x, y, rad);
    n++;
  }
  return svg(
    `<defs><filter id="b" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><feGaussianBlur stdDeviation="1.1"/></filter></defs><g fill="#fff"><g filter="url(#b)">${roughRect(lo - 0.5, lo - 0.5, hi + 0.5, hi + 0.5, 1, 1.2, 103)}</g><path d="${specks}"/>${dots}</g>`
  );
}

// A dry brush swiped across: a solid body, and toward both ends the paint breaks into horizontal
// streaks of different lengths, with dry gaps; the top and bottom rows fray the most.
function dryBrush(): string {
  const r = seeded(107);
  const top = 7;
  const bottom = 93;
  let streaks = "";
  let dry = "";
  const streak = (x0: number, x1: number, y: number, h: number) => {
    if (x1 - x0 < 0.6) return;
    const t = Math.min(h * 1.4, (x1 - x0) / 3);
    // Half a unit taller than the row, so rows that meet leave no seam (the next row covers it).
    const b = y + h + 0.5;
    streaks += `<path d="M${c1(x0)},${c1(y)}H${c1(x1)}L${c1(x1 + t)},${c1((y + b) / 2)} ${c1(x1)},${c1(b)}H${c1(x0)}L${c1(x0 - t)},${c1((y + b) / 2)}Z"/>`;
  };
  // The rows' top and bottom edges sit on a half-unit grid: Chromium draws a horizontal edge in
  // quarter-pixel steps and librsvg exactly, so the fewer odd positions, the closer the two.
  for (let y = top; y < bottom - 0.5; ) {
    const h = Math.min(1 + 0.5 * Math.floor(r() * 3), bottom - y);
    // How far the row is from the stroke's top or bottom: the rows there fray the most.
    const rim = Math.min(y - top, bottom - y - h);
    const left = Math.max(4, 10 + 4 * Math.sin(y / 8 + 1) + (r() - 0.5) * 11);
    const right = Math.min(96, 90 + 4 * Math.sin(y / 6.5) + (r() - 0.5) * 11);
    const cuts: number[] = [];
    if (r() < 0.7) cuts.push(left + 1 + r() * 8);
    if (r() < 0.7) cuts.push(right - 1 - r() * 8);
    if (r() < 0.3) cuts.push(left + 5 + r() * 9);
    if (r() < 0.3) cuts.push(right - 5 - r() * 9);
    if (rim < 6) for (let k = 0, n = 2 + Math.floor((6 - rim) * (0.6 + r())); k < n; k++) cuts.push(left + r() * (right - left));
    cuts.sort((a, b) => a - b);
    let x = left;
    for (const c of cuts) {
      streak(x, c, y, h);
      x = Math.max(x, c + 0.6 + r() * (rim < 6 ? 1.5 + (6 - rim) * 1.1 : 2.5));
    }
    streak(x, right, y, h);
    // Dry lines: thin bare lines running in from either end along the top of the row, never into the
    // solid middle.
    if (y > top + 1 && r() < 0.45) {
      const end = Math.min(left + 3 + r() * 14, 16 + r() * 7);
      if (end - left > 1) dry += `<rect x="${c1(left - 3)}" y="${y}" width="${c1(end - left + 3)}" height=".5"/>`;
    }
    if (y > top + 1 && r() < 0.45) {
      const start = Math.max(right - 3 - r() * 14, 84 - r() * 7);
      if (right - start > 1) dry += `<rect x="${c1(start)}" y="${y}" width="${c1(right + 3 - start)}" height=".5"/>`;
    }
    y += h;
  }
  return cutOut(`<rect x="20" y="${top + 6}" width="60" height="${bottom - top - 12}"/>${streaks}`, dry);
}

// A thin sliver from cx,cy, `len` long along the angle `a` and `w` wide in the middle, as path data.
function sliver(cx: number, cy: number, a: number, len: number, w: number): string {
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const hx = (ux * len) / 2;
  const hy = (uy * len) / 2;
  const wx = (-uy * w) / 2;
  const wy = (ux * w) / 2;
  return `M${c1(cx - hx)},${c1(cy - hy)}l${c1(hx + wx)},${c1(hy + wy)} ${c1(hx - wx)},${c1(hy - wy)} ${c1(-hx - wx)},${c1(-hy - wy)}z`;
}

// A scratched edge: a solid middle, thin slanted scratches crossing its edge outward, and a few
// scratches cutting into it from the edge.
function scratchedEdges(): string {
  const r = seeded(109);
  const lo = 11;
  const hi = 89;
  const at = (edge: number, along: number, out: number): [number, number, number] =>
    edge === 0 ? [along, lo - out, 0] : edge === 1 ? [hi + out, along, Math.PI / 2] : edge === 2 ? [along, hi + out, 0] : [lo - out, along, Math.PI / 2];
  let outside = "";
  for (let i = 0; i < 230; i++) {
    const edge = Math.floor(r() * 4);
    const out = -0.5 + Math.pow(r(), 2) * 8.5;
    const [cx, cy, base] = at(edge, lo - 3 + r() * (hi - lo + 6), out);
    const tilt = (r() < 0.5 ? 1 : -1) * (0.45 + r() * 0.5);
    outside += sliver(cx, cy, base + tilt, 2.5 + r() * (8 - out * 0.4), 0.3 + r() * 0.55);
  }
  let inside = "";
  for (let i = 0; i < 60; i++) {
    const edge = Math.floor(r() * 4);
    const [cx, cy, base] = at(edge, lo + 2 + r() * (hi - lo - 4), -(0.8 + r() * 3));
    const tilt = (r() < 0.5 ? 1 : -1) * (0.45 + r() * 0.5);
    inside += sliver(cx, cy, base + tilt, 2 + r() * 4.5, 0.25 + r() * 0.4);
  }
  return cutOut(`${roughRect(lo, lo, hi, hi, 0.8, 1.3, 111)}<path d="${outside}"/>`, `<path d="${inside}"/>`);
}

// A leaf 10 long, pointing along +x from its stem at 0,0: two quadratic curves (control points 4,±4.2),
// as a polygon (see dotPath).
const LEAF = (() => {
  const side = (sign: number) =>
    Array.from({ length: 7 }, (_, i): Pt => {
      const t = i / 7;
      return [2 * (1 - t) * t * 4 + t * t * 10, sign * 2 * (1 - t) * t * 4.2];
    });
  return ptsOf([...side(-1), [10, 0], ...side(1).slice(1).reverse()]);
})();
const leafAt = (x: number, y: number, rotDeg: number, len: number) =>
  `<polygon transform="translate(${c1(x)} ${c1(y)}) rotate(${c1(rotDeg)}) scale(${(len / 10).toFixed(2)})" points="${LEAF}"/>`;

// A wreath of leaves: an oval, and around it two rows of broad leaves pointing outward, every other
// one tilted the other way, like leaves in pairs along a stem.
function leafWreath(): string {
  const r = seeded(113);
  let leaves = "";
  const row = (count: number, rx: number, ry: number, len: number, tilt: number, phase: number) => {
    for (let i = 0; i < count; i++) {
      const a = ((i + phase + (r() - 0.5) * 0.25) / count) * Math.PI * 2;
      const normal = (Math.atan2(Math.sin(a) / ry, Math.cos(a) / rx) * 180) / Math.PI;
      const side = i % 2 ? 1 : -1;
      leaves += leafAt(50 + Math.cos(a) * rx, 50 + Math.sin(a) * ry, normal + side * tilt + (r() - 0.5) * 10, len * (0.85 + r() * 0.3));
    }
  };
  row(36, 31, 34, 14, 30, 0);
  row(18, 32, 35, 12, 4, 0.5);
  return svg(`<g fill="#fff"><ellipse cx="50" cy="50" rx="33" ry="36"/>${leaves}</g>`);
}

// A five-petal blossom: the shape, and the fine lines that draw it into the photo (a ring around its
// middle and a line between every two petals), to cut.
function blossom(cx: number, cy: number, size: number, rotDeg: number): { keep: string; cut: string } {
  const at = `transform="translate(${c1(cx)} ${c1(cy)}) rotate(${rotDeg})"`;
  const petal = ptsOf(ovalPts(0, -size * 0.55, size * 0.34, size * 0.48, 11));
  let petals = "";
  let lines = "";
  for (let i = 0; i < 5; i++) {
    petals += `<polygon points="${petal}" transform="rotate(${i * 72})"/>`;
    const a = ((i * 72 + 36 - 90) * Math.PI) / 180;
    lines += `M${c1(Math.cos(a) * size * 0.34)},${c1(Math.sin(a) * size * 0.34)}L${c1(Math.cos(a) * size * 0.8)},${c1(Math.sin(a) * size * 0.8)}`;
  }
  return {
    keep: `<g ${at}>${petals}<path d="${dotPath(0, 0, size * 0.3, 12)}"/></g>`,
    cut: `<g ${at}><path d="${dotPath(0, 0, size * 0.3 + 0.5, 12)}${dotPath(0, 0, size * 0.3, 12)}" fill-rule="evenodd"/><path d="${lines}" fill="none" stroke="#000" stroke-width=".45"/></g>`,
  };
}

// A rectangle whose corners burst into blossoms, buds and leaves: full clusters on two corners,
// smaller ones on the other two.
function floralCorners(): string {
  const flowers = [blossom(14.5, 14.5, 15, 10), blossom(33, 10, 8.5, 30), blossom(10, 33, 8.5, -20)];
  const keep =
    flowers.map((f) => f.keep).join("") +
    `<path d="${dotPath(44.5, 9, 2.3)}${dotPath(9, 44.5, 2.3)}"/>` +
    leafAt(38.5, 12.5, -22, 10) +
    leafAt(12.5, 38.5, 112, 10) +
    leafAt(25, 6.5, -58, 7) +
    leafAt(6.5, 25, 148, 7);
  const cut = flowers.map((f) => f.cut).join("");
  const corners = (part: string) =>
    `${part}<g transform="rotate(180 50 50)">${part}</g>` +
    [90, 270].map((rot) => `<g transform="rotate(${rot} 50 50) translate(16 16) scale(.68) translate(-16 -16)">${part}</g>`).join("");
  return cutOut(`<rect x="16" y="16" width="68" height="68"/>${corners(keep)}`, corners(cut));
}

// The heart of pattern-hearts (six cubic curves) as a polygon (see dotPath).
const HEART = (() => {
  const curves: number[][] = [
    [10, 17, 4, 12.5, 1.5, 9, 1.5, 6],
    [1.5, 6, 1.5, 3, 4, 1.2, 6.5, 2],
    [6.5, 2, 8, 2.5, 9.2, 3.7, 10, 5.2],
    [10, 5.2, 10.8, 3.7, 12, 2.5, 13.5, 2],
    [13.5, 2, 16, 1.2, 18.5, 3, 18.5, 6],
    [18.5, 6, 18.5, 9, 16, 12.5, 10, 17],
  ];
  const pts: Pt[] = [];
  for (const [x0, y0, x1, y1, x2, y2, x3, y3] of curves) {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      pts.push([w[0] * x0 + w[1] * x1 + w[2] * x2 + w[3] * x3, w[0] * y0 + w[1] * y1 + w[2] * y2 + w[3] * y3]);
    }
  }
  return ptsOf(pts);
})();

// Heart bokeh: a soft solid middle, and around it hearts of different sizes, some soft, some sharper,
// at different strengths.
function heartBokeh(): string {
  const r = seeded(127);
  const placed: [number, number, number][] = [];
  let soft = "";
  let crisp = "";
  for (let tries = 0; placed.length < 30 && tries < 4000; tries++) {
    const x = 5 + r() * 90;
    const y = 5 + r() * 90;
    const e = Math.hypot((x - 50) / 33, (y - 50) / 35);
    if (e < 0.95) continue;
    const size = (4 + r() * 7) * (e < 1.3 ? 1 : 0.75);
    // Clear of the frame's edge: librsvg doesn't blur what lies past the canvas, and Chromium does.
    // (A heart is about 1.2 times its nominal size wide, and turned.)
    if (x - size * 0.65 < 4 || x + size * 0.65 > 96 || y - size * 0.65 < 4 || y + size * 0.65 > 96) continue;
    if (placed.some(([px, py, ps]) => Math.hypot(px - x, py - y) < (ps + size) * 0.45)) continue;
    placed.push([x, y, size]);
    const heart = `<polygon fill-opacity="${(0.4 + r() * 0.6).toFixed(2)}" transform="translate(${c1(x)} ${c1(y)}) rotate(${c1((r() - 0.5) * 40)}) scale(${(size / 17).toFixed(2)}) translate(-10 -9.5)" points="${HEART}"/>`;
    if (r() < 0.45) soft += heart;
    else crisp += heart;
  }
  const filter = (id: string, dev: number) =>
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200"><feGaussianBlur stdDeviation="${dev}"/></filter>`;
  return svg(
    `<defs>${filter("a", 2.5)}${filter("b", 0.9)}</defs><g fill="#fff"><ellipse cx="50" cy="50" rx="33" ry="35" filter="url(#a)"/><g filter="url(#b)">${soft}</g>${crisp}</g>`
  );
}

// Radial halftone: solid in the middle, breaking up into smaller and smaller dots toward every edge.
function halftoneEdges(): string {
  const n = 18;
  const cell = 100 / n;
  let dots = "";
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i + 0.5) * cell;
      const y = (j + 0.5) * cell;
      const d = edgeDistance(x, y);
      if (d < 0.55) continue;
      const t = Math.min(1, Math.max(0, (d - 0.6) / 0.4));
      dots += dotPath(x, y, cell * (0.74 - 0.6 * t), t < 0.4 ? 10 : 8);
    }
  }
  return svg(`<g fill="#fff"><rect x="22" y="22" width="56" height="56" rx="6"/><path d="${dots}"/></g>`);
}

// How much of a mesh line's spacing the line fills at edge distance d: all of it (a little more, so
// neighbors overlap) in the middle, thinning out toward the edge.
const meshShare = (d: number) => (d <= 0.5 ? 1.08 : Math.max(0.06, 1.08 - (d - 0.5) * 2));

// Crosshatch: solid in the middle, and toward the edges a diagonal net whose lines get thinner:
// diamond holes on a 45° lattice, growing toward the edge.
function crosshatchEdges(): string {
  const s = 6;
  const k = Math.SQRT1_2;
  let holes = "";
  for (let a = -13; a <= 13; a++) {
    for (let b = -13; b <= 13; b++) {
      const u = (a + 0.5) * s;
      const v = (b + 0.5) * s;
      const x = 50 + (u + v) * k;
      const y = 50 + (u - v) * k;
      if (x < -4 || x > 104 || y < -4 || y > 104) continue;
      const share = meshShare(edgeDistance(x, y));
      if (share >= 1) continue;
      const h = (s / 2) * (1 - share) * Math.SQRT2;
      holes += `M${c1(x - h)},${c1(y)}l${c1(h)},${c1(-h)} ${c1(h)},${c1(h)} ${c1(-h)},${c1(h)}z`;
    }
  }
  return cutOut(`<rect width="100" height="100"/>`, `<path d="${holes}"/>`);
}

// Diagonal lines: solid in the middle, and toward the edges parallel diagonal lines that thin out.
function linesEdges(): string {
  const s = 4.4;
  const k = Math.SQRT1_2;
  let lines = `<rect x="24" y="24" width="52" height="52" rx="8"/>`;
  for (let j = -16; j <= 16; j++) {
    const v = j * s;
    let upper: Pt[] = [];
    let lower: Pt[] = [];
    const flush = () => {
      if (upper.length > 1) lines += polyOf([...upper, ...lower.reverse()]);
      upper = [];
      lower = [];
    };
    for (let u = -76; u <= 76; u += 4) {
      const x = 50 + (u + v) * k;
      const y = 50 + (u - v) * k;
      const d = edgeDistance(x, y);
      if (x < -6 || x > 106 || y < -6 || y > 106 || d < 0.42) {
        flush();
        continue;
      }
      const w = (s / 2) * meshShare(d);
      upper.push([x + k * w, y - k * w]);
      lower.push([x - k * w, y + k * w]);
    }
    flush();
  }
  return svg(`<g fill="#fff">${lines}</g>`);
}

// A cloud-shaped frame: a rectangle edged all around with round bumps of different sizes.
function cloudFrame(): string {
  const r = seeded(181);
  const lo = 17;
  const hi = 83;
  let bumps = "";
  for (let i = 0; i < 6; i++) {
    const t = lo + ((i + 0.5) / 6) * (hi - lo);
    for (let side = 0; side < 4; side++) {
      const along = t + (r() - 0.5) * 3;
      const rad = 8 + r() * 3.4;
      const out = 1.5 + r() * 1.5;
      const [x, y] = side === 0 ? [along, lo - out] : side === 1 ? [hi + out, along] : side === 2 ? [along, hi + out] : [lo - out, along];
      bumps += circleAt(x, y, rad);
    }
  }
  for (const [x, y] of [
    [lo, lo],
    [hi, lo],
    [hi, hi],
    [lo, hi],
  ])
    bumps += circleAt(x + (x < 50 ? -1 : 1), y + (y < 50 ? -1 : 1), 10 + r() * 1.2);
  return svg(`<g fill="#fff"><rect x="${lo}" y="${lo}" width="${hi - lo}" height="${hi - lo}"/>${bumps}</g>`);
}

// A daisy: sixteen long petals around a round middle, with a second, fainter row between them.
function daisy(): string {
  let back = "";
  let front = "";
  for (let i = 0; i < 16; i++) {
    back += `<ellipse cy="-33.5" rx="6" ry="14" transform="rotate(${c1(i * 22.5 + 11.25)})"/>`;
    front += `<ellipse cy="-31" rx="6" ry="13" transform="rotate(${c1(i * 22.5)})"/>`;
  }
  return svg(`<g fill="#fff" transform="translate(50 50)"><g fill-opacity=".55">${back}</g>${front}<circle r="30"/></g>`);
}

// Pinking shears: a rectangle with a small, even zigzag on every side.
function pinking(): string {
  const lo = 4;
  const hi = 96;
  const n = 36;
  const step = (hi - lo) / n;
  const depth = 1.7;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) pts.push([lo + i * step, lo], [lo + (i + 0.5) * step, lo - depth]);
  for (let i = 0; i < n; i++) pts.push([hi, lo + i * step], [hi + depth, lo + (i + 0.5) * step]);
  for (let i = 0; i < n; i++) pts.push([hi - i * step, hi], [hi - (i + 0.5) * step, hi + depth]);
  for (let i = 0; i < n; i++) pts.push([lo, hi - i * step], [lo - depth, hi - (i + 0.5) * step]);
  return svg(`<g fill="#fff">${polyOf(pts)}</g>`);
}

// A seal: a circle with many small points, and a thin ring cut just inside them.
function seal(): string {
  return cutOut(`<polygon points="${starPoints(36, 48.5, 44.5)}"/>`, `<path d="${circlePath(50, 50, 41)} ${circlePath(50, 50, 39.6)}" fill-rule="evenodd"/>`);
}

// A comic burst: a circle with irregular sharp spikes.
function burst(): string {
  const r = seeded(137);
  const n = 22;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.12;
    const out = 40 + r() * 9;
    const aIn = a + Math.PI / n + (r() - 0.5) * 0.1;
    const inn = 30 + r() * 4;
    pts.push([50 + Math.cos(a) * out, 50 + Math.sin(a) * out], [50 + Math.cos(aIn) * inn, 50 + Math.sin(aIn) * inn]);
  }
  return svg(`<g fill="#fff">${polyOf(pts)}</g>`);
}

// A burst rectangle: spikes of uneven length on every side, and a long one out of each corner.
function burstRect(): string {
  const r = seeded(139);
  const lo = 15;
  const hi = 85;
  const m = 10;
  const step = (hi - lo) / m;
  const pts: Pt[] = [];
  const sides: [(t: number, off: number) => Pt, Pt][] = [
    [(t, o) => [lo + t, lo - o], [hi, lo]],
    [(t, o) => [hi + o, lo + t], [hi, hi]],
    [(t, o) => [hi - t, hi + o], [lo, hi]],
    [(t, o) => [lo - o, hi - t], [lo, lo]],
  ];
  for (const [at, corner] of sides) {
    for (let k = 1; k < m; k++) {
      pts.push(at(k * step, -(r() * 0.8)));
      if (k < m - 1) pts.push(at((k + 0.5 + (r() - 0.5) * 0.4) * step, 4 + r() * 6.5));
    }
    const d = (9 + r() * 3) * Math.SQRT1_2;
    pts.push([corner[0] + (corner[0] > 50 ? d : -d), corner[1] + (corner[1] > 50 ? d : -d)]);
  }
  return svg(`<g fill="#fff">${polyOf(pts)}</g>`);
}

// An ornate vintage cartouche: concave notched corners ending in small round curls, a dot in each
// notch, and a soft crest in the middle of every side.
function cartouche(): string {
  const keep =
    `<rect x="8" y="10" width="84" height="80"/>` +
    `<path d="M32,10C41,10 44,3.5 50,3.5C56,3.5 59,10 68,10ZM32,90C41,90 44,96.5 50,96.5C56,96.5 59,90 68,90ZM8,35C8,43 3.5,45 3.5,50C3.5,55 8,57 8,65ZM92,35C92,43 96.5,45 96.5,50C96.5,55 92,57 92,65Z"/>`;
  const corners: [number, number, number, number][] = [
    [8, 10, 1, 1],
    [92, 10, -1, 1],
    [92, 90, -1, -1],
    [8, 90, 1, -1],
  ];
  const notch = 11;
  const cuts = corners.map(([x, y]) => circleAt(x, y, notch)).join("");
  const curls = corners.map(([x, y, sx, sy]) => circleAt(x + sx * notch, y, 2.5) + circleAt(x, y + sy * notch, 2.5) + circleAt(x + sx * 3.6, y + sy * 3.6, 2.3)).join("");
  return cutOutThen(keep, cuts, curls);
}

// Paper torn on all four sides: a slightly wandering rip, and past it a fainter strip of torn fibers.
function tornPaper(): string {
  const r = seeded(149);
  const lo = 6.5;
  const hi = 93.5;
  const main: Pt[] = [];
  const fringe: Pt[] = [];
  const side = (at: (t: number, off: number) => Pt) => {
    const ph = r() * 6.28;
    const ph2 = r() * 6.28;
    let walk = 0;
    for (let t = lo; t < hi; t += 0.7 + r() * 0.5) {
      walk = walk * 0.75 + (r() - 0.5) * 1.3;
      const off = Math.sin(t / 14 + ph) * 1.2 + Math.sin(t / 4.7 + ph2) * 0.45 + walk;
      main.push(at(t, off));
      fringe.push(at(t, off + 0.9 + Math.abs(Math.sin(t / 6 + ph2)) * 1.3 + r() * 0.8));
    }
  };
  side((t, o) => [t, lo - o]);
  side((t, o) => [hi + o, t]);
  side((t, o) => [100 - t, hi + o]);
  side((t, o) => [lo - o, 100 - t]);
  return svg(`<g fill="#fff">${polyOf(fringe, ` fill-opacity=".45"`)}${polyOf(main)}</g>`);
}

// The top-right corner torn off along a jagged diagonal, with a faint strip of fibers past the rip.
function tornCorner(): string {
  const r = seeded(151);
  const a: Pt = [50, -2];
  const b: Pt = [102, 50];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  // Toward the torn-off corner.
  const nx = uy;
  const ny = -ux;
  const tear: Pt[] = [];
  const fibers: Pt[] = [];
  let walk = 0;
  for (let s = 0; s <= len; s += 0.7 + r() * 0.5) {
    walk = walk * 0.75 + (r() - 0.5) * 1.6;
    const off = Math.sin(s / 11 + 1) * 1.6 + walk - Math.sin((s / len) * Math.PI) * 3;
    const x = a[0] + ux * s;
    const y = a[1] + uy * s;
    tear.push([x + nx * off, y + ny * off]);
    const fo = off + 1 + Math.abs(Math.sin(s / 6)) * 1.4 + r() * 0.8;
    fibers.push([x + nx * fo, y + ny * fo]);
  }
  const rest: Pt[] = [
    [102, 102],
    [-2, 102],
    [-2, -2],
  ];
  return svg(`<g fill="#fff">${polyOf([...fibers, ...rest], ` fill-opacity=".45"`)}${polyOf([...tear, ...rest])}</g>`);
}

// A page curl: the bottom-right corner folded back over the photo. The corner is gone, and the folded
// flap shows the photo faintly, shaded like a curling page.
function pageCurl(): string {
  const p: Pt = [100, 58];
  const q: Pt = [61, 100];
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const t = ((100 - p[0]) * dx + (100 - p[1]) * dy) / (dx * dx + dy * dy);
  const foot: Pt = [p[0] + dx * t, p[1] + dy * t];
  const tip: Pt = [2 * foot[0] - 100, 2 * foot[1] - 100];
  // The flap's edges bow out a little, like paper that curls rather than creases.
  const bow = (e: Pt): Pt => {
    const mx = (e[0] + tip[0]) / 2;
    const my = (e[1] + tip[1]) / 2;
    return [mx + (mx - foot[0]) * 0.18, my + (my - foot[1]) * 0.18];
  };
  const pt = ([x, y]: Pt) => `${c1(x)},${c1(y)}`;
  const flap = `M${pt(p)}Q${pt(bow(p))} ${pt(tip)}Q${pt(bow(q))} ${pt(q)}Z`;
  return svg(
    `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><path d="M${pt(p)}L100,100 ${pt(q)}Z${flap}" fill="#000"/></mask><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${c1(foot[0])}" y1="${c1(foot[1])}" x2="${c1(tip[0])}" y2="${c1(tip[1])}"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity=".38"/></linearGradient></defs><rect width="100" height="100" fill="#fff" mask="url(#m)"/><path d="${flap}" fill="url(#g)"/>`
  );
}

// Grass: the whole photo, with blades of grass of different heights rising into it from the bottom,
// taller thin ones behind and shorter wide ones in front.
function grass(): string {
  const r = seeded(167);
  let blades = "";
  const layer = (gapMin: number, gapMax: number, hMin: number, hRange: number, wMin: number, wRange: number) => {
    for (let x = -2; x < 102; x += gapMin + r() * (gapMax - gapMin)) {
      const h = hMin + r() * hRange + (Math.sin(x / 9 + 1) + 1) * 3 + (r() < 0.1 ? 6 : 0);
      const w = wMin + r() * wRange;
      const lean = (r() - 0.5) * 12;
      blades += `<path d="M${c1(x - w)},101Q${c1(x - w * 0.3 + lean * 0.15)},${c1(99 - h * 0.6)} ${c1(x + lean)},${c1(97 - h)}Q${c1(x + w * 0.5 + lean * 0.1)},${c1(99 - h * 0.5)} ${c1(x + w)},101Z"/>`;
    }
  };
  layer(1.6, 3.2, 9, 12, 0.5, 0.6);
  layer(0.8, 1.9, 3, 7, 0.7, 0.9);
  return cutOut(`<rect width="100" height="100"/>`, `<rect y="96.5" width="100" height="4"/>${blades}`);
}

// A rectangle ring: the frame from x0,y0 to x1,y1, `t` thick (the inner rectangle runs the other
// way round, so it's a hole).
function rectRingPath(x0: number, y0: number, x1: number, y1: number, t: number): string {
  return `M${c1(x0)},${c1(y0)}H${c1(x1)}V${c1(y1)}H${c1(x0)}Z M${c1(x0 + t)},${c1(y0 + t)}V${c1(y1 - t)}H${c1(x1 - t)}V${c1(y0 + t)}Z`;
}

// The photo inset, with thin line frames of the photo around it: [inset, thickness, opacity].
function lineFrames(inset: number, rings: [number, number, number][]): string {
  const ringXml = rings.map(([i, t, o]) => `<path d="${rectRingPath(i, i, 100 - i, 100 - i, t)}"${o < 1 ? ` fill-opacity="${o}"` : ""}/>`).join("");
  return svg(`<g fill="#fff"><rect x="${inset}" y="${inset}" width="${100 - 2 * inset}" height="${100 - 2 * inset}"/>${ringXml}</g>`);
}

// A vertical film strip: sprocket bands down both sides, and two frames between them.
function filmVertical(): string {
  let holes = "";
  for (let i = 0; i < 12; i++) {
    const y = 2.2 + i * 8.3;
    holes += `<rect x="7.5" y="${f1(y)}" width="5" height="4.4" rx="1"/><rect x="87.5" y="${f1(y)}" width="5" height="4.4" rx="1"/>`;
  }
  return cutOut(
    `<rect x="5" y="0" width="10" height="100"/><rect x="17.5" y="1.5" width="65" height="47"/><rect x="17.5" y="51.5" width="65" height="47"/><rect x="85" y="0" width="10" height="100"/>`,
    holes
  );
}

// A film strip with three frames side by side.
function filmThree(): string {
  let holes = "";
  for (let i = 0; i < 12; i++) {
    const x = 2.2 + i * 8.3;
    holes += `<rect x="${f1(x)}" y="7.5" width="4.4" height="5" rx="1"/><rect x="${f1(x)}" y="87.5" width="4.4" height="5" rx="1"/>`;
  }
  return cutOut(
    `<rect x="0" y="5" width="100" height="10"/><rect x="0" y="85" width="100" height="10"/><rect x="2" y="18" width="30.5" height="64" rx=".8"/><rect x="34.75" y="18" width="30.5" height="64" rx=".8"/><rect x="67.5" y="18" width="30.5" height="64" rx=".8"/>`,
    holes
  );
}

// A jigsaw knob on the edge point x,y, toward nx,ny: a round head on a narrower neck.
// The neck runs 1 unit past the edge, so a knob cut inward is open at the edge.
function puzzleKnob(x: number, y: number, nx: number, ny: number): string {
  const reach = 8.5;
  const hx = x + nx * reach;
  const hy = y + ny * reach;
  const neck = nx
    ? `<rect x="${Math.min(x, hx) - 1}" y="${y - 3.6}" width="${reach + 2}" height="7.2"/>`
    : `<rect x="${x - 3.6}" y="${Math.min(y, hy) - 1}" width="7.2" height="${reach + 2}"/>`;
  return `${neck}<circle cx="${hx}" cy="${hy}" r="6.4"/>`;
}

// A 3×3 jigsaw: the photo cut into interlocking pieces along thin seams, each with a round knob.
function puzzleGrid(): string {
  const r = seeded(173);
  const lo = 3;
  const hi = 97;
  const n = 3;
  const size = (hi - lo) / n;
  const neck = 3.2;
  const knob = 5.4;
  let d = "";
  for (let k = 1; k < n; k++) {
    const c = lo + k * size;
    d += `M${c1(c)},${lo}`;
    for (let j = 0; j < n; j++) {
      const m = lo + (j + 0.5) * size;
      d += `L${c1(c)},${c1(m - neck)}A${knob},${knob} 0 1 ${r() < 0.5 ? 1 : 0} ${c1(c)},${c1(m + neck)}`;
    }
    d += `L${c1(c)},${hi}M${lo},${c1(c)}`;
    for (let i = 0; i < n; i++) {
      const m = lo + (i + 0.5) * size;
      d += `L${c1(m - neck)},${c1(c)}A${knob},${knob} 0 1 ${r() < 0.5 ? 1 : 0} ${c1(m + neck)},${c1(c)}`;
    }
    d += `L${hi},${c1(c)}`;
  }
  return cutOut(`<rect x="${lo}" y="${lo}" width="${hi - lo}" height="${hi - lo}" rx="1.5"/>`, `<path d="${d}" fill="none" stroke="#000" stroke-width=".9" stroke-linejoin="round"/>`);
}

// A pattern of small stars, every other row shifted half a step.
function starPattern(): string {
  let stars = "";
  for (let row = 0; row < 11; row++) {
    for (let col = -1; col < 10; col++) {
      const x = 5.5 + col * 11 + (row % 2 ? 5.5 : 0);
      const y = 4.5 + row * 10;
      if (x < -5 || x > 105) continue;
      stars += polyOf(starAt(x, y, 5, 2.1, row % 2 ? 0 : 18));
    }
  }
  return svg(`<g fill="#fff">${stars}</g>`);
}

// A border of stars: a solid middle, and around it stars of different sizes, smaller toward the edge.
function starBorder(): string {
  const r = seeded(179);
  const placed: [number, number, number][] = [];
  let stars = "";
  for (let tries = 0; placed.length < 70 && tries < 8000; tries++) {
    const x = 2 + r() * 96;
    const y = 2 + r() * 96;
    const out = Math.max(Math.abs(x - 50) - 27, Math.abs(y - 50) - 27, 0);
    if (out < 1) continue;
    const size = Math.max(1.4, 5.8 - out * 0.22) * (0.8 + r() * 0.45);
    if (x - size < 0.5 || x + size > 99.5 || y - size < 0.5 || y + size > 99.5) continue;
    if (placed.some(([px, py, ps]) => Math.hypot(px - x, py - y) < (ps + size) * 0.85)) continue;
    placed.push([x, y, size]);
    stars += polyOf(starAt(x, y, size, size * 0.42, r() * 72));
  }
  return svg(`<g fill="#fff"><rect x="22" y="22" width="56" height="56" rx="3"/>${stars}</g>`);
}

// Up to `count` well-spread points (best of several random candidates each time).
function spreadPoints(count: number, seed: number): Pt[] {
  const r = seeded(seed);
  const pts: Pt[] = [];
  while (pts.length < count) {
    let best: Pt = [0, 0];
    let bestGap = -1;
    for (let c = 0; c < 12; c++) {
      const cand: Pt = [4 + r() * 92, 4 + r() * 92];
      const gap = pts.length ? Math.min(...pts.map(([x, y]) => Math.hypot(x - cand[0], y - cand[1]))) : 1;
      if (gap > bestGap) {
        best = cand;
        bestGap = gap;
      }
    }
    pts.push(best);
  }
  return pts;
}

// Shards: the frame split into irregular polygons (a Voronoi diagram) with thin gaps between them.
function voronoiShards(): string {
  const sites = spreadPoints(15, 157);
  let shards = "";
  for (const p of sites) {
    let cell: Pt[] = [
      [1.5, 1.5],
      [98.5, 1.5],
      [98.5, 98.5],
      [1.5, 98.5],
    ];
    for (const q of sites) {
      if (q === p) continue;
      cell = clipHalf(cell, q[0] - p[0], q[1] - p[1], (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1]) / 2);
    }
    cell = insetConvex(cell, 0.6);
    if (cell.length > 2) shards += polyOf(cell);
  }
  return svg(`<g fill="#fff">${shards}</g>`);
}

// Shattered glass: cracks radiating from an impact point and rings of cracks around it; a small
// hole at the impact, and the shards near it a little fainter, like broken glass.
function shatteredGlass(): string {
  const r = seeded(163);
  const ix = 38;
  const iy = 44;
  const rays = 14;
  const angles = Array.from({ length: rays }, (_, i) => ((i + (r() - 0.5) * 0.7) / rays) * Math.PI * 2);
  const radii = [3.5, 9, 18, 30, 45, 65, 150];
  const ring = radii.map((rad, k) => angles.map(() => (k === radii.length - 1 ? rad : rad * (0.82 + r() * 0.36))));
  const at = (k: number, i: number): Pt => {
    const a = angles[i % rays];
    const d = ring[k][i % rays];
    return [ix + Math.cos(a) * d, iy + Math.sin(a) * d];
  };
  let shards = "";
  const add = (p: Pt[], k: number) => {
    let c = p;
    for (const [a, b, cc] of [
      [-1, 0, -1.5],
      [1, 0, 98.5],
      [0, -1, -1.5],
      [0, 1, 98.5],
    ])
      c = clipHalf(c, a, b, cc);
    if (c.length < 3) return;
    c = insetConvex(c, 0.45);
    if (c.length < 3 || areaOf(c) < 0.6) return;
    const op = k === 0 ? 0.55 + r() * 0.25 : k === 1 ? 0.72 + r() * 0.25 : r() < 0.15 ? 0.88 : 1;
    shards += polyOf(c, op < 1 ? ` fill-opacity="${op.toFixed(2)}"` : "");
  };
  for (let k = 0; k < radii.length - 1; k++) {
    for (let i = 0; i < rays; i++) {
      const quad: Pt[] = [at(k, i), at(k, i + 1), at(k + 1, i + 1), at(k + 1, i)];
      if (!isConvex(quad) || r() < 0.4) {
        if (r() < 0.5) {
          add([quad[0], quad[1], quad[2]], k);
          add([quad[0], quad[2], quad[3]], k);
        } else {
          add([quad[0], quad[1], quad[3]], k);
          add([quad[1], quad[2], quad[3]], k);
        }
      } else add(quad, k);
    }
  }
  return svg(`<g fill="#fff">${shards}</g>`);
}

// A spiral: one arm winding out from the middle past the corners, wider as it goes.
function spiral(): string {
  const pitch = 25;
  const b = pitch / (2 * Math.PI);
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let t = 0; t <= 20; t += 0.11) {
    const half = pitch * 0.3 * Math.min(1, t / 4);
    const rad = b * t;
    const a = t - Math.PI / 2;
    outer.push([50 + Math.cos(a) * (rad + half), 50 + Math.sin(a) * (rad + half)]);
    inner.push([50 + Math.cos(a) * Math.max(0, rad - half), 50 + Math.sin(a) * Math.max(0, rad - half)]);
  }
  return svg(`<g fill="#fff"><circle cx="50" cy="50" r="3"/>${polyOf([...outer, ...inner.reverse()])}</g>`);
}

// A pinwheel: eight curved blades turning out from the middle.
function pinwheel(): string {
  const blades = 8;
  const step = (Math.PI * 2) / blades;
  let s = "";
  for (let i = 0; i < blades; i++) {
    const a0 = i * step;
    const lead: Pt[] = [];
    const trail: Pt[] = [];
    for (let k = 0; k <= 18; k++) {
      const f = k / 18;
      const rad = 3 + f * 74;
      const twist = 1.0 * f * f;
      const aL = a0 + twist;
      const aT = a0 + twist + step * 0.56 * Math.sqrt(f);
      lead.push([50 + Math.cos(aL) * rad, 50 + Math.sin(aL) * rad]);
      trail.push([50 + Math.cos(aT) * rad, 50 + Math.sin(aT) * rad]);
    }
    s += polyOf([...lead, ...trail.reverse()]);
  }
  return svg(`<g fill="#fff"><circle cx="50" cy="50" r="6"/>${s}</g>`);
}

// A wipe from the bottom-left corner: full there, fading out along a wide curve.
function cornerSweep(): string {
  return svg(
    `<defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="0" cy="100" r="105"><stop offset=".6" stop-color="#fff"/><stop offset=".7" stop-color="#fff" stop-opacity=".84"/><stop offset=".8" stop-color="#fff" stop-opacity=".5"/><stop offset=".9" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>`
  );
}

// A light leak: a soft band of light across the frame, tilted and uneven (two soft bands at slightly
// different angles), with a flare at one end. Gradients only, no blur: the band runs off the frame's
// edges, and librsvg doesn't blur what lies past the canvas.
function lightBand(): string {
  const band = (id: string, rot: number, stops: [number, number][]) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100" gradientTransform="rotate(${rot} 50 50)">${stops
      .map(([o, a]) => `<stop offset="${o}" stop-color="#fff" stop-opacity="${a}"/>`)
      .join("")}</linearGradient>`;
  return svg(
    `<defs>${band("a", -8, [
      [0.16, 0],
      [0.24, 0.35],
      [0.31, 0.85],
      [0.36, 1],
      [0.6, 1],
      [0.66, 0.8],
      [0.74, 0.3],
      [0.82, 0],
    ])}${band("b", 5, [
      [0.42, 0],
      [0.52, 0.5],
      [0.63, 0.7],
      [0.73, 0.3],
      [0.81, 0],
    ])}<radialGradient id="c" gradientUnits="userSpaceOnUse" cx="76" cy="44" r="30"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#a)"/><rect width="100" height="100" fill="url(#b)"/><rect width="100" height="100" fill="url(#c)"/>`
  );
}

// Checkered edges: a solid middle, and two rows of checker squares around it.
function checkerBorder(): string {
  const n = 16;
  const cell = 100 / n;
  let squares = `<rect x="${c1(2 * cell)}" y="${c1(2 * cell)}" width="${c1(12 * cell)}" height="${c1(12 * cell)}"/>`;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (Math.min(i, j, n - 1 - i, n - 1 - j) > 1 || (i + j) % 2) continue;
      // A hair bigger, so no seam shows where a square meets the middle.
      squares += `<rect x="${c1(i * cell - 0.2)}" y="${c1(j * cell - 0.2)}" width="${c1(cell + 0.4)}" height="${c1(cell + 0.4)}"/>`;
    }
  }
  return svg(`<g fill="#fff">${squares}</g>`);
}

// Lace: a solid middle edged with scallops, each with three small picots on its rim and an eyelet,
// and a row of eyelets just inside the edge.
function lace(): string {
  const lo = 12;
  const hi = 88;
  const n = 10;
  const step = (hi - lo) / n;
  const rad = step / 2;
  let keep = "";
  let holes = "";
  const scallop = (x: number, y: number, nx: number, ny: number, size: number) => {
    keep += dotPath(x, y, size, 14);
    const base = Math.atan2(ny, nx);
    for (const a of [-0.9, 0, 0.9]) keep += dotPath(x + Math.cos(base + a) * (size + 0.2), y + Math.sin(base + a) * (size + 0.2), 0.95, 7);
    holes += dotPath(x + nx * size * 0.35, y + ny * size * 0.35, 1.05, 8);
  };
  for (let i = 0; i < n; i++) {
    const t = lo + (i + 0.5) * step;
    scallop(t, lo, 0, -1, rad);
    scallop(hi, t, 1, 0, rad);
    scallop(t, hi, 0, 1, rad);
    scallop(lo, t, -1, 0, rad);
  }
  const k = Math.SQRT1_2;
  scallop(lo, lo, -k, -k, rad * 1.15);
  scallop(hi, lo, k, -k, rad * 1.15);
  scallop(hi, hi, k, k, rad * 1.15);
  scallop(lo, hi, -k, k, rad * 1.15);
  for (let i = 1; i < n; i++) {
    const t = lo + i * step;
    holes += dotPath(t, lo + 3.2, 0.75, 7) + dotPath(hi - 3.2, t, 0.75, 7) + dotPath(t, hi - 3.2, 0.75, 7) + dotPath(lo + 3.2, t, 0.75, 7);
  }
  return cutOut(`<rect x="${lo}" y="${lo}" width="${hi - lo}" height="${hi - lo}"/><path d="${keep}"/>`, `<path d="${holes}"/>`);
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

  // From the owner's reference album (2026-11-02).
  { id: "shape-hexagon-rounded", label: "משושה מעוגל", svg: roundedPolygon(6, 47, 5) },
  { id: "shape-circle-ring", label: "עיגול עם טבעת", svg: circleWithRing() },
  { id: "creative-grunge", label: "שוליים מחוספסים", svg: grungeEdges() },
  { id: "creative-arc-right", label: "קשתות בצד ימין", svg: arcBands("right") },
  { id: "creative-arc-left", label: "קשתות בצד שמאל", svg: arcBands("left") },
  { id: "soft-edge-narrow", label: "קצוות רכים עדינים", svg: softEdges(3.5) },

  // The owner's mask pack, our own versions (2026-11-02)
  { id: "pack-spray", label: "שוליים מרוססים", svg: sprayEdges() },
  { id: "pack-dry-brush", label: "מכחול יבש", svg: dryBrush() },
  { id: "pack-scratched", label: "שוליים שרוטים", svg: scratchedEdges() },
  { id: "pack-soft-rounded", label: "מלבן רך", svg: softBlur(`<rect x="15" y="15" width="70" height="70" rx="14"/>`, 6) },
  { id: "pack-soft-oval", label: "אובל רך", svg: softBlur(`<ellipse cx="50" cy="50" rx="33" ry="44"/>`, 6) },
  { id: "pack-soft-wide", label: "אליפסה רכה", svg: softBlur(`<ellipse cx="50" cy="50" rx="45" ry="32"/>`, 6) },
  { id: "pack-leaf-wreath", label: "זר עלים", svg: leafWreath() },
  { id: "pack-floral-corners", label: "פרחים בפינות", svg: floralCorners() },
  { id: "pack-heart-bokeh", label: "לבבות מרחפים", svg: heartBokeh() },
  { id: "pack-halftone-edge", label: "נקודות בשוליים", svg: halftoneEdges() },
  { id: "pack-crosshatch-edge", label: "רשת בשוליים", svg: crosshatchEdges() },
  { id: "pack-lines-edge", label: "קווים בשוליים", svg: linesEdges() },
  { id: "pack-cloud-frame", label: "מסגרת ענן", svg: cloudFrame() },
  { id: "pack-daisy", label: "חרצית", svg: daisy() },
  { id: "pack-pinking", label: "מספרי זיגזג", svg: pinking() },
  { id: "pack-seal", label: "חותם", svg: seal() },
  { id: "pack-burst", label: "פיצוץ", svg: burst() },
  { id: "pack-burst-rect", label: "מלבן קוצני", svg: burstRect() },
  { id: "pack-cartouche", label: "מסגרת וינטג'", svg: cartouche() },
  { id: "pack-ticket", label: "כרטיס", svg: pathShape("M18,4H82A14,14 0 0 0 96,18V82A14,14 0 0 0 82,96H18A14,14 0 0 0 4,82V18A14,14 0 0 0 18,4Z") },
  { id: "pack-torn-paper", label: "נייר קרוע מכל הצדדים", svg: tornPaper() },
  { id: "pack-torn-corner", label: "פינה קרועה", svg: tornCorner() },
  { id: "pack-page-curl", label: "פינה מקופלת", svg: pageCurl() },
  { id: "pack-grass", label: "דשא", svg: grass() },
  { id: "pack-line-frame", label: "מסגרת קו", svg: lineFrames(9, [[3.2, 1.6, 1]]) },
  {
    id: "pack-double-line",
    label: "מסגרת קו כפול",
    svg: lineFrames(12, [
      [7, 1.1, 1],
      [3.5, 1.1, 1],
    ]),
  },
  {
    id: "pack-triple-line",
    label: "שלושה קווים דוהים",
    svg: lineFrames(14, [
      [10, 1.2, 1],
      [6.5, 1, 0.7],
      [3.2, 0.9, 0.45],
    ]),
  },
  { id: "pack-folder", label: "צורת תיקייה", svg: svg(`<g fill="#fff"><rect x="5" y="15" width="90" height="80" rx="3.5"/><path d="M5,19V10Q5,6 9,6H33Q36,6 38,8.5L43.5,16H5Z"/></g>`) },
  { id: "pack-film-vertical", label: "סרט צילום אנכי", svg: filmVertical() },
  { id: "pack-film-three", label: "שלושה פריימים בסרט", svg: filmThree() },
  {
    id: "pack-puzzle-piece",
    label: "חלק של פאזל",
    svg: cutOut(`<rect x="18" y="18" width="64" height="64" rx="1.5"/>${puzzleKnob(50, 18, 0, -1)}${puzzleKnob(82, 50, 1, 0)}`, `${puzzleKnob(50, 82, 0, -1)}${puzzleKnob(18, 50, 1, 0)}`),
  },
  { id: "pack-puzzle", label: "פאזל", svg: puzzleGrid() },
  { id: "pack-stars", label: "כוכבים", svg: starPattern() },
  { id: "pack-star-border", label: "כוכבים מסביב", svg: starBorder() },
  { id: "pack-shards", label: "רסיסים", svg: voronoiShards() },
  { id: "pack-shattered", label: "זכוכית מנופצת", svg: shatteredGlass() },
  { id: "pack-spiral", label: "ספירלה", svg: spiral() },
  { id: "pack-pinwheel", label: "שבשבת", svg: pinwheel() },
  { id: "pack-corner-sweep", label: "דהייה מעוגלת מהפינה", svg: cornerSweep() },
  { id: "pack-light-band", label: "פס אור רך", svg: lightBand() },
  { id: "pack-double-arch", label: "חלון כפול", svg: pathShape("M6,95V42A20.5,22 0 0 1 47,42V95ZM53,95V42A20.5,22 0 0 1 94,42V95Z") },
  { id: "pack-checker-border", label: "משבצות בשוליים", svg: checkerBorder() },
  { id: "pack-lace", label: "תחרה", svg: lace() },

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

// The owner's mask pack (2026-11-02), so the editor can show them to the admin only for now.
export const PACK_MASK_IDS: ReadonlySet<string> = new Set(ALBUM_MASKS.filter((m) => m.id.startsWith("pack-")).map((m) => m.id));
