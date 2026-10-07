// A small offline synth: instruments render notes into Float32Arrays, a Mix places them on
// stereo buses (dry + reverb send), and master() compresses, limits and normalises.
export const SR = 44100;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

let seed = 12345;
export function setSeed(s) { seed = s >>> 0 || 1; }
export function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
const noise = () => rnd() * 2 - 1;

// ---- filters ----
// TPT state-variable filter; cutoff can change per sample.
export class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; }
  run(x, fc, q = 0.707) {
    const g = Math.tan(Math.PI * Math.min(fc, SR * 0.45) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return { lp: v2, bp: v1, hp: x - k * v1 - v2 };
  }
}
export function filt(buf, type, fc, q = 0.707) {
  const f = new SVF();
  for (let i = 0; i < buf.length; i++) buf[i] = f.run(buf[i], typeof fc === "function" ? fc(i / SR) : fc, q)[type];
  return buf;
}

// ---- oscillators ----
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
export function saw(freqAt, len, phase0 = rnd()) {
  const out = new Float32Array(len);
  let ph = phase0;
  for (let i = 0; i < len; i++) {
    const f = typeof freqAt === "function" ? freqAt(i / SR) : freqAt;
    const dt = f / SR;
    out[i] = 2 * ph - 1 - blep(ph, dt);
    ph += dt; if (ph >= 1) ph -= 1;
  }
  return out;
}

const env = (t, a, d, s, r, dur) => {
  let v = t < a ? t / a : t < a + d ? 1 - (1 - s) * ((t - a) / d) : s;
  if (t > dur) v *= Math.exp(-(t - dur) / Math.max(0.001, r / 4));
  return v;
};

// ---- instruments (mono note buffers) ----
export function piano(m, dur, vel = 0.8) {
  const f = mtof(m);
  const len = Math.floor((dur + 1.6) * SR);
  const out = new Float32Array(len);
  const B = 0.00012 * Math.pow(2, (m - 60) / 24);
  const base = 0.9 + (m - 48) * 0.035; // higher notes die faster
  const H = Math.min(12, Math.floor(9000 / f));
  for (let h = 1; h <= H; h++) {
    const fh = f * h * Math.sqrt(1 + B * h * h);
    const amp = (1 / Math.pow(h, 1.25)) * Math.pow(vel, 0.4 + h * 0.12) * (h === 1 ? 1 : 0.85);
    const dec = base * (1 + h * 0.55);
    const w = 2 * Math.PI * fh / SR, w2 = 2 * Math.PI * fh * 1.0009 / SR;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const e = Math.exp(-t * dec) * (t > dur ? Math.exp(-(t - dur) * 9) : 1);
      if (e < 1e-4) break;
      out[i] += amp * e * 0.5 * (Math.sin(w * i) + Math.sin(w2 * i + h));
    }
  }
  const atk = Math.floor(0.004 * SR);
  for (let i = 0; i < atk; i++) out[i] *= i / atk;
  // hammer
  const hn = new Float32Array(Math.floor(0.03 * SR));
  for (let i = 0; i < hn.length; i++) hn[i] = noise() * Math.exp(-i / SR * 160) * 0.06 * vel;
  filt(hn, "bp", f * 4, 1.2);
  for (let i = 0; i < hn.length; i++) out[i] += hn[i];
  return out;
}

// Electric piano (FM, Rhodes-like) with a slow tremolo.
export function epiano(m, dur, vel = 0.7) {
  const f = mtof(m);
  const len = Math.floor((dur + 1.2) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const idx = (1.6 * vel) * Math.exp(-t * 2.5) + 0.25;
    const mod = Math.sin(2 * Math.PI * f * t) * idx;
    const tine = Math.sin(2 * Math.PI * f * 14 * t) * 0.18 * vel * Math.exp(-t * 18);
    const e = Math.exp(-t * 0.9) * (t > dur ? Math.exp(-(t - dur) * 7) : 1) * Math.min(1, t / 0.003);
    out[i] = (Math.sin(2 * Math.PI * f * t + mod + tine) * e) * 0.6 * (0.85 + 0.15 * Math.sin(2 * Math.PI * 4.5 * t));
  }
  return out;
}

// Warm pad: three detuned saws, low-passed, slow envelope.
export function pad(m, dur, { cutoff = 1400, attack = 0.9, release = 1.6, detune = 0.006, bright = 0 } = {}) {
  const f = mtof(m);
  const len = Math.floor((dur + release * 1.5) * SR);
  const out = new Float32Array(len);
  for (const d of [-detune, 0, detune]) {
    const s = saw(f * (1 + d), len);
    for (let i = 0; i < len; i++) out[i] += s[i] / 3;
  }
  filt(out, "lp", (t) => cutoff * (1 + bright * Math.min(1, t / 2)), 0.6);
  for (let i = 0; i < len; i++) out[i] *= env(i / SR, attack, 0.5, 0.85, release, dur);
  return out;
}

// Ensemble strings: five detuned saws with vibrato.
export function strings(m, dur, { attack = 0.6, release = 1.4, cutoff = 2200, vel = 0.8 } = {}) {
  const f = mtof(m);
  const len = Math.floor((dur + release * 1.5) * SR);
  const out = new Float32Array(len);
  const dets = [-0.008, -0.004, 0, 0.004, 0.008];
  for (const d of dets) {
    const vr = 4.6 + rnd() * 1.2, vp = rnd() * 6;
    const s = saw((t) => f * (1 + d) * (1 + 0.0035 * Math.sin(2 * Math.PI * vr * t + vp) * Math.min(1, t / 0.8)), len);
    for (let i = 0; i < len; i++) out[i] += s[i] / dets.length;
  }
  filt(out, "lp", cutoff * (0.6 + 0.4 * vel), 0.5);
  filt(out, "hp", 120);
  for (let i = 0; i < len; i++) out[i] *= env(i / SR, attack, 0.3, 0.9, release, dur) * vel;
  return out;
}

// Plucked string (Karplus-Strong), for the acoustic guitar and harp-like plucks.
export function pluck(m, dur, { bright = 0.5, decay = 0.996, vel = 0.8 } = {}) {
  const f = mtof(m);
  const N = Math.max(2, Math.round(SR / f));
  const len = Math.floor((dur + 2.5) * SR);
  const out = new Float32Array(len);
  const buf = new Float32Array(N);
  const lp = new SVF();
  for (let i = 0; i < N; i++) buf[i] = lp.run(noise(), 1500 + bright * 6000).lp;
  let idx = 0;
  const stretch = Math.pow(decay, 440 / f / 8);
  for (let i = 0; i < len; i++) {
    const a = buf[idx], b = buf[(idx + 1) % N];
    const v = (a * (0.5 + bright * 0.15) + b * (0.5 - bright * 0.15)) * stretch;
    buf[idx] = v;
    out[i] = a * vel * (i / SR > dur ? Math.exp(-(i / SR - dur) * 6) : 1);
    idx = (idx + 1) % N;
  }
  return out;
}

// Sine bass with a touch of harmonics and saturation.
export function bass(m, dur, { vel = 0.8, drive = 1.5 } = {}) {
  const f = mtof(m);
  const len = Math.floor((dur + 0.25) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const x = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 4);
    const e = Math.min(1, t / 0.006) * (t > dur ? Math.exp(-(t - dur) * 30) : 1) * (0.85 + 0.15 * Math.exp(-t * 6));
    out[i] = Math.tanh(x * drive) / Math.tanh(drive) * e * vel;
  }
  return out;
}

// Analog-style synth note: saw through a resonant low-pass with its own envelope (plucky lead /
// house chords).
export function synth(m, dur, { cutoff = 900, envAmt = 3000, fdec = 6, q = 1.2, attack = 0.003, release = 0.25, detune = 0.004, vel = 0.8 } = {}) {
  const f = mtof(m);
  const len = Math.floor((dur + release * 2) * SR);
  const out = new Float32Array(len);
  for (const d of [-detune, detune]) {
    const s = saw(f * (1 + d), len);
    for (let i = 0; i < len; i++) out[i] += s[i] / 2;
  }
  const sv = new SVF();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = sv.run(out[i], cutoff + envAmt * Math.exp(-t * fdec), q).lp * env(t, attack, 0.1, 0.8, release, dur) * vel;
  }
  return out;
}

// ---- drums ----
export function kick({ vel = 1, tune = 1, decay = 6 } = {}) {
  const len = Math.floor(0.6 * SR);
  const out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = (46 + 130 * Math.exp(-t * 38)) * tune;
    ph += 2 * Math.PI * f / SR;
    out[i] = Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-t * decay) * vel;
    if (i < 0.003 * SR) out[i] += noise() * 0.25 * vel * (1 - i / (0.003 * SR));
  }
  return out;
}
export function snare({ vel = 0.8, tone = 185, len = 0.35 } = {}) {
  const n = Math.floor(len * SR);
  const out = new Float32Array(n);
  const nz = new Float32Array(n);
  for (let i = 0; i < n; i++) nz[i] = noise();
  filt(nz, "bp", 2200, 0.6);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = (Math.sin(2 * Math.PI * tone * t) * 0.55 * Math.exp(-t * 22) + nz[i] * 1.1 * Math.exp(-t * 15)) * vel;
  }
  return out;
}
export function clap({ vel = 0.8 } = {}) {
  const n = Math.floor(0.4 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let e = Math.exp(-t * 12) * 0.7;
    for (const o of [0, 0.011, 0.022]) if (t >= o && t < o + 0.01) e = Math.max(e, Math.exp(-(t - o) * 90));
    out[i] = noise() * e * vel;
  }
  filt(out, "bp", 1300, 0.9);
  for (let i = 0; i < n; i++) out[i] *= 1.6;
  return out;
}
export function hat({ vel = 0.5, open = false } = {}) {
  const n = Math.floor((open ? 0.5 : 0.08) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = noise();
  filt(out, "hp", 7500, 0.8);
  for (let i = 0; i < n; i++) out[i] *= Math.exp(-(i / SR) * (open ? 7 : 55)) * vel;
  return out;
}
export function shaker({ vel = 0.35 } = {}) {
  const n = Math.floor(0.09 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = noise();
  filt(out, "bp", 6500, 1.2);
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] *= Math.min(1, t / 0.02) * Math.exp(-t * 40) * vel; }
  return out;
}
// A big low drum hit (cinematic).
export function boom({ vel = 1 } = {}) {
  const n = Math.floor(2 * SR);
  const out = new Float32Array(n);
  const nz = new Float32Array(n);
  for (let i = 0; i < n; i++) nz[i] = noise();
  filt(nz, "lp", 400, 0.7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += 2 * Math.PI * (52 + 40 * Math.exp(-t * 10)) / SR;
    out[i] = (Math.tanh(Math.sin(ph) * 1.4) * Math.exp(-t * 2.2) + nz[i] * 0.8 * Math.exp(-t * 7)) * vel;
  }
  return out;
}
export function crash({ vel = 0.4 } = {}) {
  const n = Math.floor(2.5 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = noise();
  filt(out, "hp", 4500, 0.6);
  for (let i = 0; i < n; i++) out[i] *= Math.exp(-(i / SR) * 1.8) * vel;
  return out;
}

// ---- mixing ----
export class Mix {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    this.bus = {};
  }
  get(name) {
    if (!this.bus[name]) this.bus[name] = { L: new Float32Array(this.n), R: new Float32Array(this.n) };
    return this.bus[name];
  }
  // Places a mono buffer at time `at` on `bus`, panned (-1..1), with a reverb send.
  add(buf, at, { gain = 1, pan = 0, send = 0.2, bus = "main" } = {}) {
    const start = Math.floor(at * SR);
    const pl = Math.cos((pan + 1) * Math.PI / 4), pr = Math.sin((pan + 1) * Math.PI / 4);
    const b = this.get(bus), r = this.get("verb");
    for (let i = 0; i < buf.length; i++) {
      const j = start + i;
      if (j < 0) continue;
      if (j >= this.n) break;
      const v = buf[i] * gain;
      b.L[j] += v * pl; b.R[j] += v * pr;
      if (send) { r.L[j] += v * pl * send; r.R[j] += v * pr * send; }
    }
  }
}

// Freeverb.
export function reverb(bus, { room = 0.84, damp = 0.35, wet = 1 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const aps = [556, 441, 341, 225];
  const out = { L: new Float32Array(bus.L.length), R: new Float32Array(bus.L.length) };
  for (const [ch, spread] of [["L", 0], ["R", 23]]) {
    const inp = bus[ch], o = out[ch];
    for (const c of combs) {
      const N = c + spread, buf = new Float32Array(N);
      let idx = 0, store = 0;
      for (let i = 0; i < inp.length; i++) {
        const y = buf[idx];
        store = y * (1 - damp) + store * damp;
        buf[idx] = inp[i] * 0.015 + store * room;
        o[i] += y;
        idx = (idx + 1) % N;
      }
    }
    for (const a of aps) {
      const N = a + spread, buf = new Float32Array(N);
      let idx = 0;
      for (let i = 0; i < o.length; i++) {
        const b = buf[idx];
        const y = -o[i] + b;
        buf[idx] = o[i] + b * 0.5;
        o[i] = y;
        idx = (idx + 1) % N;
      }
    }
    for (let i = 0; i < o.length; i++) o[i] *= wet;
  }
  return out;
}

// Ducks a bus on every beat (sidechain pumping for dance tracks).
export function duck(bus, beat, start, depth = 0.6, n) {
  for (let i = 0; i < n; i++) {
    const t = i / SR - start;
    if (t < 0) continue;
    const ph = (t % beat) / beat;
    const g = 1 - depth * Math.pow(1 - Math.min(1, ph / 0.45), 2);
    bus.L[i] *= g; bus.R[i] *= g;
  }
}

// Sum the buses, compress gently, soft-limit, normalise, fade in/out.
export function master(mix, { verb = {}, busGain = {}, fadeIn = 0.02, fadeOut = 2.5, targetRms = 0.14 } = {}) {
  const n = mix.n;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const [name, b] of Object.entries(mix.bus)) {
    if (name === "verb") continue;
    const g = busGain[name] ?? 1;
    for (let i = 0; i < n; i++) { L[i] += b.L[i] * g; R[i] += b.R[i] * g; }
  }
  if (mix.bus.verb) {
    const v = reverb(mix.bus.verb, verb);
    for (let i = 0; i < n; i++) { L[i] += v.L[i]; R[i] += v.R[i]; }
  }
  // gentle bus compression
  let envl = 0;
  const att = Math.exp(-1 / (0.01 * SR)), rel = Math.exp(-1 / (0.2 * SR));
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += L[i] * L[i] + R[i] * R[i];
  const rms0 = Math.sqrt(sumSq / (2 * n)) || 1;
  const thr = rms0 * 1.6;
  for (let i = 0; i < n; i++) {
    const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    envl = x > envl ? att * envl + (1 - att) * x : rel * envl + (1 - rel) * x;
    const g = envl > thr ? Math.pow(thr / envl, 0.5) : 1;
    L[i] *= g; R[i] *= g;
  }
  // normalise to the target loudness, then soft-limit the peaks
  sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += L[i] * L[i] + R[i] * R[i];
  const k = targetRms / (Math.sqrt(sumSq / (2 * n)) || 1);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = Math.min(1, t / fadeIn) * Math.min(1, (n / SR - t) / fadeOut);
    L[i] = Math.tanh(L[i] * k * 1.05) * 0.93 * f;
    R[i] = Math.tanh(R[i] * k * 1.05) * 0.93 * f;
  }
  return { L, R };
}

export function wav({ L, R }) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  return buf;
}
