// Soundtrack for the short ads (SKILL.md "Short ads"): the "energy" track (124 BPM, the one the owner
// chose for every promo, 2026-10-11) arranged to the ad's length, plus sound effects on the edit's
// cues. A real editor cuts the music to the picture: a build under the pain, the drop on the turn,
// and a button ending on the last hit instead of a fade. The patterns and sounds are the ones in
// scripts/reel-music/tracks.mjs (energy), so it is the same track.
// Usage: node ad-audio.mjs <plan.json> <out.wav>
// plan: { duration, drop, end, breaks: [[a, b]], cues: [[t, type, gain?]] }, all in seconds.
//   drop   where the drop lands (the arpeggio, open filter and crash); before it the track builds,
//          with a riser and a snare roll into it. 0 starts the ad on the drop.
//   end    the button: a last hit and a held chord, then only the tails.
//   breaks spans without the kick and bass (a breath before a hit).
import { readFileSync, writeFileSync } from "fs";
import { Mix, SR, SVF, bass, boom, clap, crash, duck, filt, hat, kick, master, rnd, setSeed, snare, synth, wav } from "../../../scripts/reel-music/dsp.mjs";

const plan = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = process.argv[3];
const BPM = 124, b = 60 / BPM, BAR = 4 * b;
const { duration, drop = 0, end = duration, breaks = [], cues = [] } = plan;
setSeed(66);
const noise = () => rnd() * 2 - 1;
const mx = new Mix(duration + 0.05);

// ---- music ----
const N = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const chord = (name, oct = 4) => { const r = 12 * (oct + 1) + N[name[0]]; return [r, r + (name.includes("m") ? 3 : 4), r + 7]; };
const prog = ["Am", "F", "C", "G"];
const inBreak = (t) => breaks.some(([a, z]) => t >= a - 0.001 && t < z - 0.001);
const bars = Math.ceil(end / BAR);
for (let i = 0; i < bars; i++) {
  const t0 = i * BAR;
  const name = prog[i % 4];
  const tri = chord(name, 4);
  const r1 = chord(name, 2)[0];
  const pre = t0 < drop - 0.001;
  // Before the drop the filter opens bar by bar (as in the track's build); after it, wide open.
  const preBars = Math.max(1, Math.round(drop / BAR));
  const build = pre ? 0.45 + 0.5 * (i / preBars) : 1;
  for (let k = 0; k < 4; k++) {
    const t = t0 + k * b;
    if (t >= end - 0.001) break;
    if (!inBreak(t)) mx.add(kick({ vel: 1 }), t, { gain: 0.78, send: 0, bus: "kick" });
    mx.add(hat({ vel: 0.4, open: true }), t + 0.5 * b, { gain: pre ? 0.25 : 0.35, pan: 0.2, send: 0.05 });
    for (let s = 0; s < 4; s++) mx.add(hat({ vel: s % 2 ? 0.18 : 0.12 }), t + s * b / 4, { gain: 0.45, pan: -0.25, send: 0 });
    if (k % 2 === 1) mx.add(clap({ vel: 0.75 }), t, { gain: 0.55, send: 0.2 });
    if (!inBreak(t) && !(pre && i === 0)) mx.add(bass(r1 + 12, b * 0.4, { vel: 0.9, drive: 2.2 }), t + 0.5 * b, { gain: 0.4, send: 0, bus: "pump" });
    if (!pre && !inBreak(t)) {
      const arp = [tri[0] + 12, tri[2] + 12, tri[1] + 12, tri[2] + 12];
      for (let s = 0; s < 4; s++) mx.add(synth(arp[s], b / 4 * 0.8, { cutoff: 1200, envAmt: 3500, fdec: 18, q: 1.3, vel: s === 0 ? 0.7 : 0.5 }), t + s * b / 4, { gain: 0.15, pan: s % 2 ? 0.35 : -0.35, send: 0.25 });
    }
  }
  const len = Math.min(BAR * 0.98, end - t0);
  if (len > 0.05) for (const m of tri) mx.add(synth(m, len, { cutoff: 500 + 2600 * build + (pre ? 0 : 1500), envAmt: 600, fdec: 2, q: 0.9, attack: 0.01, release: 0.2, detune: 0.009, vel: 0.6 }), t0, { gain: 0.14, pan: (m % 3 - 1) * 0.4, send: 0.25, bus: "pump" });
}
// Into the drop: a noise riser over the last bar and a snare roll over its last two beats.
if (drop > 0.5) {
  const rl = Math.min(BAR, drop);
  const n = Math.floor(rl * SR), r = new Float32Array(n), sv = new SVF();
  for (let i = 0; i < n; i++) { const p = i / n; r[i] = sv.run(noise(), 300 * Math.pow(30, p), 1.4).bp * p * p * 1.4; }
  mx.add(r, drop - rl, { gain: 0.5, send: 0.3 });
  for (let s = 0; s < 8; s++) mx.add(snare({ vel: 0.35 + 0.55 * (s / 7), len: 0.2 }), drop - 2 * b + s * b / 4, { gain: 0.5, send: 0.25 });
}
if (drop < end) {
  mx.add(crash({ vel: 0.45 }), drop, { gain: 0.6, send: 0.2 });
  mx.add(boom({ vel: 0.8 }), drop, { gain: 0.45, send: 0.15 });
}
// The button: one last kick, boom and crash, and the chord held into the reverb.
{
  const name = prog[Math.floor(end / BAR) % 4];
  mx.add(kick({ vel: 1, decay: 4 }), end, { gain: 0.85, send: 0.1, bus: "kick" });
  mx.add(boom({ vel: 1 }), end, { gain: 0.6, send: 0.3 });
  mx.add(crash({ vel: 0.5 }), end, { gain: 0.7, send: 0.35 });
  for (const m of [...chord(name, 4), chord(name, 4)[0] + 12]) mx.add(synth(m, 0.35, { cutoff: 2600, envAmt: 2500, fdec: 5, q: 0.9, attack: 0.004, release: 0.9, detune: 0.01, vel: 0.65 }), end, { gain: 0.16, pan: (m % 3 - 1) * 0.4, send: 0.6 });
  mx.add(bass(chord(name, 2)[0] + 12, 0.6, { vel: 1, drive: 2 }), end, { gain: 0.45, send: 0 });
}
duck(mx.get("pump"), b, 0, 0.7, Math.floor(Math.min(mx.n, end * SR)));
duck(mx.get("verb"), b, 0, 0.4, Math.floor(Math.min(mx.n, end * SR)));
// The build sits under the drop (half the level, rising into it), or the drop doesn't land: the
// master normalises the whole mix, so the contrast has to be in the mix itself.
if (drop > 0.5) for (const name of ["main", "kick", "pump", "verb"]) {
  const bus = mx.get(name), n = Math.floor(drop * SR);
  for (let i = 0; i < n; i++) { const g = 0.5 + 0.35 * Math.pow(i / n, 1.5); bus.L[i] *= g; bus.R[i] *= g; }
}

// ---- sound effects ----
const buf = (sec) => new Float32Array(Math.floor(sec * SR));
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) * d));
const sfx = {
  // A camera: mirror slap and shutter, 55 ms apart, each a short band of noise over a low thump.
  shutter() {
    const o = buf(0.2);
    for (const [at, fc, v] of [[0, 3800, 1], [0.055, 5200, 0.8]]) {
      const sv = new SVF();
      for (let i = Math.floor(at * SR); i < o.length; i++) {
        const t = i / SR - at;
        o[i] += (sv.run(noise(), fc, 2.2).bp * 2.2 * Math.exp(-t * 160) + Math.sin(2 * Math.PI * 110 * t) * 0.6 * Math.exp(-t * 90)) * v;
      }
    }
    return o;
  },
  // A soft two-note message chime (original, not any app's sound).
  ping() {
    const o = buf(0.7);
    for (const [at, f] of [[0, 1318.5], [0.085, 1975.5]]) for (let i = Math.floor(at * SR); i < o.length; i++) {
      const t = i / SR - at;
      o[i] += (Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(4 * Math.PI * f * t)) * env(t, 0.003, 9) * 0.5;
    }
    return o;
  },
  // A phone vibrating on a table: a buzzy 160 Hz, felt more than heard.
  buzz() {
    const o = buf(0.36);
    for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = Math.tanh(3 * Math.sin(2 * Math.PI * 160 * t)) * Math.min(1, t / 0.01) * Math.min(1, (0.36 - t) / 0.05) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 23 * t)); }
    return filt(o, "lp", 1400);
  },
  // Air past the mic: band-passed noise sweeping up and back down.
  whoosh(len = 0.42) {
    const o = buf(len), sv = new SVF();
    for (let i = 0; i < o.length; i++) {
      const p = i / o.length;
      o[i] = sv.run(noise(), 350 * Math.pow(12, Math.sin(Math.PI * Math.min(1, p * 1.15))), 1.1).bp * Math.pow(Math.sin(Math.PI * Math.pow(p, 0.7)), 2) * 1.6;
    }
    return o;
  },
  // A rising whoosh that ends exactly on its cue (the cue is the hit, it starts 0.3 s before).
  suck() {
    const o = buf(0.3), sv = new SVF();
    for (let i = 0; i < o.length; i++) { const p = i / o.length; o[i] = sv.run(noise(), 400 * Math.pow(15, p), 1.3).bp * p * p * 1.8; }
    return o;
  },
  // A hit: a low drum and a short crack.
  impact() {
    const o = boom({ vel: 0.9 });
    const sv = new SVF();
    for (let i = 0; i < 0.05 * SR; i++) o[i] += sv.run(noise(), 2500, 0.8).hp * Math.exp(-(i / SR) * 70) * 0.8;
    return o;
  },
  // A light tap on glass.
  tap() {
    const o = buf(0.06), sv = new SVF();
    for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = (Math.sin(2 * Math.PI * 2300 * t) * 0.6 + sv.run(noise(), 4000, 1).bp * 0.8) * Math.exp(-t * 120); }
    return o;
  },
  // A counter tick.
  tick() {
    const o = buf(0.03);
    for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 260); }
    return o;
  },
  // A word or a card landing: a short pitch drop.
  pop() {
    const o = buf(0.09);
    let ph = 0;
    for (let i = 0; i < o.length; i++) { const t = i / SR; ph += 2 * Math.PI * (820 - 380 * Math.min(1, t / 0.05)) / SR; o[i] = Math.sin(ph) * env(t, 0.002, 45); }
    return o;
  },
};
const LEVEL = { shutter: 0.55, ping: 0.32, buzz: 0.28, whoosh: 0.42, suck: 0.4, impact: 0.55, tap: 0.3, tick: 0.12, pop: 0.22 };
const LEAD = { suck: 0.3 };
for (const [t, type, gain = 1, pan = 0] of cues) {
  if (!sfx[type]) throw new Error("unknown cue " + type);
  mx.add(sfx[type](), t - (LEAD[type] || 0), { gain: LEVEL[type] * gain, pan, send: type === "impact" || type === "whoosh" ? 0.15 : 0.05, bus: "sfx" });
}

const res = master(mx, { verb: { room: 0.72, damp: 0.5 }, fadeIn: 0.004, fadeOut: 0.25, targetRms: 0.16 });
writeFileSync(out, wav(res));
let peak = 0, sq = 0;
for (let i = 0; i < res.L.length; i++) { peak = Math.max(peak, Math.abs(res.L[i])); sq += res.L[i] ** 2; }
console.log("audio", (res.L.length / SR).toFixed(2) + "s", "peak", peak.toFixed(2), "rms", Math.sqrt(sq / res.L.length).toFixed(3), "cues", cues.length);
