// Shared motion for the short ads (ad1/ad2/ad3.html, SKILL.md "Short ads"). Everything is a pure
// function of t (seconds), so ad.js can render any frame in any order and the picture always
// matches the soundtrack built from window.AUDIO.
const BEAT = 60 / 124, BAR = 4 * BEAT, B = (n) => n * BEAT;
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeIn = (x) => Math.pow(clamp(x), 3);
const easeIO = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = (x, c = 1.7) => { x = clamp(x); return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const $ = (id) => document.getElementById(id);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
// Visible inside [a, b), with a fade in and out (in seconds).
const vis = (t, [a, b], fi = 0.12, fo = 0.12) => Math.min(ease((t - a) / fi), b === Infinity ? 1 : ease((b - t) / fo));

// Camera shake after hits: a few fast, decaying jolts (an editor's "impact shake"), never constant.
function shake(t, hits, amp = 16, dur = 0.38) {
  let x = 0, y = 0, r = 0;
  for (const h of hits) {
    const s = t - h;
    if (s < 0 || s > dur) continue;
    const k = Math.pow(1 - s / dur, 2) * amp;
    x += Math.sin(s * 71 + h * 13) * k; y += Math.cos(s * 59 + h * 7) * k * 0.8; r += Math.sin(s * 43 + h) * k * 0.025;
  }
  return { x, y, r };
}
// A punch-in on a hit: the frame jumps a little closer and settles back.
const punch = (t, hits, amt = 0.06, dur = 0.3) => hits.reduce((s, h) => s + (t >= h && t < h + dur ? amt * (1 - ease((t - h) / dur)) : 0), 0);

// Words for [data-words]: each word gets a clip box, so it can rise into place from below its line.
function splitWords() {
  document.querySelectorAll("[data-words]").forEach((el) => {
    el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="wd"><i>${w}</i></span>`).join(" ");
  });
}
// Words rise in one after another (reading order), with a slight tilt that straightens as they land.
function reveal(el, t, at, { stagger = 0.06, dur = 0.38, out = Infinity, outDur = 0.18 } = {}) {
  const ws = el.querySelectorAll(".wd > i");
  ws.forEach((w, i) => {
    const p = ease((t - at - i * stagger) / dur);
    const o = t > out ? easeIn((t - out) / outDur) : 0;
    w.style.transform = `translateY(${(1 - p) * 105 - o * 105}%) rotate(${(1 - p) * 7}deg)`;
    w.style.opacity = p > 0 ? 1 : 0;
  });
  el.style.opacity = 1;
}
// Lands from a bigger size, with a short motion blur while it moves.
function slam(el, t, at, from = 1.35, dur = 0.26, base = "") {
  const p = ease((t - at) / dur);
  el.style.opacity = clamp((t - at) / 0.06);
  el.style.transform = `${base} scale(${from - (from - 1) * p})`;
  el.style.filter = p < 1 && t >= at ? `blur(${(1 - p) * 10}px)` : "none";
}
function rise(el, t, at, dist = 60, dur = 0.35, base = "") {
  const p = ease((t - at) / dur);
  el.style.opacity = p;
  el.style.transform = `${base} translateY(${(1 - p) * dist}px)`;
}
// The marker stroke behind a word (promo3's "עם"): drawn right to left, the word pops as it lands,
// a light sweep and a glow follow. Gold words turn navy on the gold.
const mixRgb = (a, b, p) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * p)).join(",")})`;
function marker(el, t, at) {
  const sw = el.firstElementChild, yes = !el.classList.contains("no");
  const p = ease((t - at) / 0.28);
  sw.style.transform = `scaleX(${p})`;
  const pop = 1 + 0.12 * Math.sin(Math.PI * clamp((t - at - 0.14) / 0.3));
  const s = t - at - 0.28;
  const dx = !yes && s > 0 && s < 0.5 ? 12 * Math.sin(s * 2 * Math.PI * 8) * (1 - s / 0.5) : 0;
  el.style.transform = `translateX(${dx}px) scale(${pop})`;
  if (!yes) return;
  el.style.color = mixRgb([201, 161, 90], [11, 18, 32], p);
  if (sw.firstElementChild) sw.firstElementChild.style.left = 100 - 150 * ease((t - at - 0.32) / 0.6) + "%";
  const g = Math.sin(Math.PI * clamp((t - at - 0.22) / 1.1));
  sw.style.boxShadow = `0 0 ${60 * g}px ${12 * g}px rgba(225,185,110,${0.55 * g})`;
}
// A whip pan: the layer leaves sideways with motion blur, or arrives from the other side.
function whip(el, t, at, { dir = 1, dur = 0.24, inbound = false, base = "" } = {}) {
  const p = inbound ? 1 - ease((t - at) / dur) : easeIn((t - at) / dur);
  const v = inbound ? Math.max(0, 1 - (t - at) / dur) : clamp((t - at) / dur);
  el.style.transform = `${base} translateX(${dir * p * 1300}px) skewX(${-dir * p * 8}deg)`;
  el.style.filter = v > 0.02 && v < 0.999 ? `blur(${Math.sin(Math.PI * v) * 22}px)` : "none";
}

// A warm light leak drifting across the frame after a big hit (screen blend), like light into a lens.
function leak(t, hits, dur = 1.1) {
  const el = $("leak");
  if (!el) return;
  let best = null;
  for (const h of hits) if (t >= h && t < h + dur) best = h;
  if (best === null) { el.style.opacity = 0; return; }
  const p = (t - best) / dur, k = hits.indexOf(best);
  el.style.opacity = 0.75 * Math.sin(Math.PI * Math.pow(p, 0.6));
  el.style.left = (k % 2 ? 1250 - 1400 * p : -170 + 1400 * p) + "px";
  el.style.top = 300 + 500 * p + "px";
}

// Film grain: fresh noise every frame, seeded by the frame number (deterministic per t).
let grainCtx, grainImg;
function grain(t, alpha = 0.055) {
  const cv = $("grain");
  if (!cv) return;
  if (!grainCtx) { grainCtx = cv.getContext("2d"); grainImg = grainCtx.createImageData(cv.width, cv.height); }
  let s = (Math.floor(t * 30) * 2654435761) >>> 0 || 1;
  const d = grainImg.data;
  for (let i = 0; i < d.length; i += 4) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const v = s & 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  grainCtx.putImageData(grainImg, 0, 0);
  cv.style.opacity = alpha;
}

// Frames of the app footage (f-* folders), shown on the phone screen.
const lastSrc = {};
async function frameAt(img, dir, count, local, fps = 30) {
  const n = Math.min(count, Math.max(1, Math.floor(local * fps) + 1));
  const src = `${dir}/${String(n).padStart(5, "0")}.jpg`;
  if (lastSrc[img.id] === src) return;
  lastSrc[img.id] = src;
  img.src = src;
  await img.decode().catch(() => {});
}
async function setImg(img, src) {
  if (lastSrc[img.id] === src) return;
  lastSrc[img.id] = src;
  img.src = src;
  await img.decode().catch(() => {});
}

// Lines in [data-fit] shrink until they fit their box; .msg lines share the smallest size.
async function fitAll() {
  await document.fonts.ready;
  document.querySelectorAll("[data-fit], .msg > b").forEach((el) => {
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth + 1 && size > 36) el.style.fontSize = (size -= 2) + "px";
  });
  document.querySelectorAll(".msg").forEach((m) => {
    const ls = [...m.children];
    const least = Math.min(...ls.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    ls.forEach((el) => (el.style.fontSize = least + "px"));
  });
}
