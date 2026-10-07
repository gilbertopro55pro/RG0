import { writeFileSync } from "fs";
import { Mix, SR, bass, boom, clap, crash, duck, epiano, filt, hat, kick, master, pad, piano, pluck, setSeed, shaker, snare, strings, synth, wav, rnd } from "./dsp.mjs";

// Triad / seventh chords as MIDI notes.
const N = { C: 0, "C#": 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const chord = (name, oct = 4) => {
  const m = name.match(/^([A-G][b#]?)(m?)(maj7|7)?$/);
  const r = 12 * (oct + 1) + N[m[1]];
  const third = m[2] ? 3 : 4;
  const notes = [r, r + third, r + 7];
  if (m[3] === "maj7") notes.push(r + 11);
  if (m[3] === "7") notes.push(r + 10);
  return notes;
};
const note = (s) => { const m = s.match(/^([A-G][b#]?)(-?\d)$/); return 12 * (+m[2] + 1) + N[m[1]]; };
const mel = (str) => str.trim().split(/\s+/).map((tok) => { const [n, at, d] = tok.split(":"); return [note(n), +at, +d]; });

const out = process.argv[2];
const tracks = {};

// 1. Tender piano with strings — emotional, for weddings and family moments.
tracks.tender = () => {
  setSeed(11);
  const bpm = 72, b = 60 / bpm, bar = 4 * b;
  const prog = ["C", "G", "Am", "F", "C", "G", "F", "G"];
  const bassNote = { C: 36, G: 35, Am: 33, F: 29 }; // G over B the first time
  const bars = 19;
  const mx = new Mix(bars * bar + 3);
  const melody = [
    mel("E5:0:1.5 D5:1.5:.5 C5:2:1 G4:3:1"), mel("D5:0:1.5 C5:1.5:.5 B4:2:2"), mel("C5:0:1 E5:1:1 A5:2:1.5 G5:3.5:.5"), mel("F5:0:1 E5:1:1 C5:2:2"),
    mel("E5:0:1 G5:1:1 C6:2:1.5 B5:3.5:.5"), mel("B5:0:1 G5:1:1 D5:2:2"), mel("A5:0:1 G5:1:1 F5:2:1 E5:3:1"), mel("D5:0:3 G4:3:1"),
  ];
  for (let i = 0; i < bars; i++) {
    const t0 = i * bar;
    const last = i === bars - 1;
    const name = last ? "C" : i < 2 ? (i === 0 ? "C" : "F") : prog[(i - 2) % 8];
    const tri = chord(name.replace("m", "m"), 4);
    const root = (i >= 2 && (i - 2) % 8 === 1) ? 35 : bassNote[name];
    // left hand: low root and a broken chord on eighths (sustain pedal: notes ring to the bar end)
    mx.add(piano(root, bar * 0.95, 0.55), t0, { gain: 0.34, pan: -0.15, send: 0.25 });
    if (!last) {
      const pat = [root + 12, tri[0] - 12 + 7, tri[0], tri[1], tri[2], tri[1], tri[0], tri[0] - 12 + 7];
      pat.forEach((m, k) => mx.add(piano(m, bar - k * b / 2, 0.38 + (k % 4 === 0 ? 0.08 : 0)), t0 + k * b / 2, { gain: 0.36, pan: -0.1 + k * 0.03, send: 0.3 }));
    } else {
      for (const m of [...tri, tri[0] + 12]) mx.add(piano(m, 3.5, 0.5), t0, { gain: 0.4, send: 0.35 });
    }
    if (i >= 2 && !last) {
      const phrase = melody[(i - 2) % 8];
      const up = i >= 10 ? 0 : 0;
      for (const [m, at, d] of phrase) mx.add(piano(m + up, d * b * 1.1, i >= 10 ? 0.72 : 0.62), t0 + at * b, { gain: 0.5, pan: 0.15, send: 0.3 });
    }
    if (i >= 10) {
      for (const m of chord(name, 3)) mx.add(strings(m + 12, bar, { attack: 1, release: 1.8, vel: 0.55, cutoff: 1800 }), t0, { gain: 0.32, pan: (rnd() - 0.5) * 0.6, send: 0.45 });
      mx.add(strings(root, bar, { attack: 0.8, release: 1.5, vel: 0.5, cutoff: 900 }), t0, { gain: 0.35, send: 0.3 });
    }
  }
  return master(mx, { verb: { room: 0.88, damp: 0.4, wet: 1 }, fadeOut: 3, targetRms: 0.12 });
};

// 2. Celebration pop — upbeat, bright.
tracks.celebration = () => {
  setSeed(22);
  const bpm = 118, b = 60 / bpm, bar = 4 * b;
  const prog = ["G", "D", "Em", "C"];
  const bars = 24;
  const mx = new Mix(bars * bar + 2);
  const hook = [
    mel("D5:0:.5 G5:.5:.5 A5:1:.5 B5:1.5:1 A5:2.5:.5 G5:3:1"),
    mel("F#5:0:.5 A5:.5:.5 A5:1:.5 F#5:1.5:.5 E5:2:.5 D5:2.5:1.5"),
    mel("E5:0:.5 G5:.5:.5 B5:1:1 A5:2:.5 G5:2.5:.5 E5:3:1"),
    mel("E5:0:.5 D5:.5:.5 C5:1:.5 D5:1.5:1.5 B4:3:1"),
  ];
  for (let i = 0; i < bars; i++) {
    const t0 = i * bar;
    const name = prog[i % 4];
    const tri = chord(name, 4);
    const r2 = chord(name, 2)[0];
    const verse = i >= 4, chorus = i >= 12;
    // offbeat plucky chords
    for (let k = 0; k < 8; k++) {
      if (k % 2 === 0 && !chorus) continue;
      for (const m of tri) mx.add(synth(m, b * 0.4, { cutoff: 700, envAmt: chorus ? 4200 : 2600, fdec: 14, q: 1, vel: k % 2 ? 0.5 : 0.35 }), t0 + k * b / 2, { gain: 0.16, pan: (m % 3 - 1) * 0.35, send: 0.18 });
    }
    // drums
    for (let k = 0; k < 8; k++) mx.add(hat({ vel: k % 2 ? 0.32 : 0.22 }), t0 + k * b / 2, { gain: 0.5, pan: 0.3, send: 0.05 });
    if (verse) {
      for (const at of [0, 1.5, 2]) mx.add(kick({ vel: 0.95 }), t0 + at * b, { gain: 0.72, send: 0 });
      for (const at of [1, 3]) mx.add(snare({ vel: 0.7 }), t0 + at * b, { gain: 0.55, send: 0.18 });
      if (chorus) for (const at of [1, 3]) mx.add(clap({ vel: 0.6 }), t0 + at * b, { gain: 0.5, pan: 0.1, send: 0.2 });
      // bass on eighths
      for (let k = 0; k < 8; k++) mx.add(bass(k === 7 ? r2 + 7 : r2, b * 0.42, { vel: k % 2 ? 0.7 : 0.85 }), t0 + k * b / 2, { gain: 0.38, send: 0 });
    }
    if (chorus) {
      for (const [m, at, d] of hook[i % 4]) mx.add(synth(m, d * b * 0.9, { cutoff: 1400, envAmt: 2500, fdec: 5, q: 0.9, attack: 0.008, release: 0.18, vel: 0.7 }), t0 + at * b, { gain: 0.3, pan: 0.05, send: 0.3 });
      for (const m of tri) mx.add(pad(m, bar, { cutoff: 1800, attack: 0.3, release: 0.6 }), t0, { gain: 0.1, pan: (rnd() - 0.5), send: 0.3 });
    }
    if (i === 4 || i === 12) mx.add(crash({ vel: 0.35 }), t0, { gain: 0.6, send: 0.2 });
  }
  return master(mx, { verb: { room: 0.75, damp: 0.5 }, fadeOut: 2.5, targetRms: 0.15 });
};

// 3. Cinematic — strings, ostinato, low drums, building.
tracks.cinematic = () => {
  setSeed(33);
  const bpm = 80, b = 60 / bpm, bar = 4 * b;
  const prog = ["Dm", "Bb", "F", "C"];
  const bars = 17;
  const mx = new Mix(bars * bar + 4);
  const line = [mel("F5:0:2 A5:2:2"), mel("D6:0:3 C6:3:1"), mel("A5:0:4"), mel("G5:0:2 E5:2:2"), mel("D6:0:2 A5:2:2"), mel("D6:0:2 F6:2:2"), mel("C6:0:2 A5:2:2"), mel("G5:0:4")];
  for (let i = 0; i < bars; i++) {
    const t0 = i * bar;
    const last = i === bars - 1;
    const name = last ? "Dm" : prog[i % 4];
    const lowRoot = chord(name, 2)[0];
    const sv = 0.45 + Math.min(0.45, i * 0.035);
    for (const m of chord(name, 3)) mx.add(strings(m, last ? 3 : bar, { attack: 0.9, release: 2, vel: sv }), t0, { gain: 0.3, pan: (m % 4 - 1.5) * 0.25, send: 0.5 });
    mx.add(strings(lowRoot, last ? 3 : bar, { attack: 0.6, release: 2, vel: sv, cutoff: 800 }), t0, { gain: 0.3, send: 0.3 });
    if (i >= 4 && !last) {
      const tri = chord(name, 5);
      const pat = [tri[0], tri[2], tri[1], tri[2]];
      for (let k = 0; k < 8; k++) mx.add(piano(pat[k % 4], b * 0.45, 0.5), t0 + k * b / 2, { gain: 0.26, pan: 0.25, send: 0.4 });
    }
    if (i >= 8 && !last) for (const [m, at, d] of line[(i - 8) % 8]) mx.add(strings(m, d * b, { attack: 0.25, release: 1, vel: 0.75, cutoff: 3200 }), t0 + at * b, { gain: 0.32, pan: -0.1, send: 0.5 });
    const hits = i >= 12 ? [0, 2.5] : i >= 8 ? [0] : i >= 4 && i % 2 === 0 ? [0] : [];
    for (const at of hits) mx.add(boom({ vel: at ? 0.6 : 0.9 }), t0 + at * b, { gain: 0.55, send: 0.35 });
    if (i >= 12 && !last) for (const at of [1, 3]) mx.add(snare({ vel: 0.35, tone: 160 }), t0 + at * b, { gain: 0.35, send: 0.5 });
    if (i === 12 || last) { mx.add(crash({ vel: 0.3 }), t0, { gain: 0.5, send: 0.4 }); mx.add(boom({ vel: 1 }), t0, { gain: 0.8, send: 0.4 }); }
  }
  return master(mx, { verb: { room: 0.92, damp: 0.3 }, fadeOut: 3.5, targetRms: 0.13 });
};

// 4. Acoustic — strummed guitar, claps and shaker, a light plucked melody.
tracks.acoustic = () => {
  setSeed(44);
  const bpm = 100, b = 60 / bpm, bar = 4 * b;
  const prog = ["D", "A", "Bm", "G"];
  const shapes = { D: ["D3", "A3", "D4", "F#4", "A4"], A: ["A2", "E3", "A3", "C#4", "E4"], Bm: ["B2", "F#3", "B3", "D4", "F#4"], G: ["G2", "B2", "D3", "G3", "B3", "G4"] };
  const bars = 20;
  const mx = new Mix(bars * bar + 3);
  const tune = [mel("F#5:0:1 A5:1:1 F#5:2:.5 E5:2.5:.5 D5:3:1"), mel("E5:0:1.5 C#5:1.5:.5 A4:2:2"), mel("D5:0:1 F#5:1:1 B5:2:1 A5:3:1"), mel("G5:0:1 F#5:1:1 E5:2:2")];
  const strum = [[0, "d", 1], [1, "d", 0.8], [1.5, "u", 0.6], [2.5, "u", 0.6], [3, "d", 0.85], [3.5, "u", 0.55]];
  for (let i = 0; i < bars; i++) {
    const t0 = i * bar;
    const last = i === bars - 1;
    const name = last ? "D" : prog[i % 4];
    const strings6 = shapes[name].map(note);
    for (const [at, dir, v] of last ? [[0, "d", 1]] : strum) {
      const set = dir === "d" ? strings6 : strings6.slice(-4).reverse();
      set.forEach((m, k) => mx.add(pluck(m, last ? 3 : b * 1.2, { bright: dir === "d" ? 0.55 : 0.7, decay: 0.997, vel: v * 0.5 }), t0 + at * b + k * 0.011, { gain: 0.42, pan: -0.25 + k * 0.08, send: 0.2 }));
    }
    for (let k = 0; k < 16; k++) mx.add(shaker({ vel: k % 4 === 2 ? 0.4 : 0.25 }), t0 + k * b / 4, { gain: 0.5, pan: 0.4, send: 0.1 });
    if (i >= 4 && !last) {
      for (const at of [1, 3]) mx.add(clap({ vel: 0.5 }), t0 + at * b, { gain: 0.45, pan: -0.05, send: 0.3 });
      for (const at of [0, 2.5]) mx.add(kick({ vel: 0.6, decay: 9 }), t0 + at * b, { gain: 0.48, send: 0.05 });
      const r = note(shapes[name][0]) - 12;
      for (const at of [0, 2]) mx.add(bass(r, b * 1.6, { vel: 0.6, drive: 1.2 }), t0 + at * b, { gain: 0.34, send: 0 });
    }
    if (i >= 8 && i < 16) for (const [m, at, d] of tune[i % 4]) mx.add(pluck(m, d * b, { bright: 0.8, decay: 0.998, vel: 0.6 }), t0 + at * b, { gain: 0.5, pan: 0.2, send: 0.35 });
  }
  return master(mx, { verb: { room: 0.7, damp: 0.45 }, fadeOut: 3, targetRms: 0.14 });
};

// 5. Lo-fi chill — jazzy electric piano, swung drums, vinyl crackle.
tracks.lofi = () => {
  setSeed(55);
  const bpm = 82, b = 60 / bpm, bar = 4 * b;
  const prog = [["F3", "A3", "C4", "E4", "A4"], ["E3", "G3", "B3", "D4", "G4"], ["D3", "F3", "A3", "C4", "F4"], ["C3", "E3", "G3", "B3", "E4"]];
  const roots = ["F1", "E1", "D1", "C2"];
  const bars = 16;
  const mx = new Mix(bars * bar + 3);
  const sw = (x) => Math.floor(x) + (x % 1 === 0.5 ? 0.62 : x % 1); // swung eighths
  const lead = [mel("E5:1:.5 G5:1.5:.5 A5:2:1.5"), mel("G5:0:1 F5:1:.5 E5:1.5:1.5"), mel("D5:0.5:.5 F5:1:.5 A5:1.5:1 G5:2.5:1"), mel("E5:0:3")];
  for (let i = 0; i < bars; i++) {
    const t0 = i * bar;
    const c = prog[i % 4].map(note);
    for (const at of [0, 1.5]) for (const m of c) mx.add(epiano(m, at ? b * 2.2 : b * 1.4, 0.55), t0 + sw(at) * b + (rnd() * 0.012), { gain: 0.22, pan: (m % 5 - 2) * 0.12, send: 0.25 });
    mx.add(bass(note(roots[i % 4]) + 12, b * 1.8, { vel: 0.7, drive: 1.1 }), t0, { gain: 0.42, send: 0 });
    mx.add(bass(note(roots[i % 4]) + 12, b * 0.9, { vel: 0.55, drive: 1.1 }), t0 + sw(2.5) * b, { gain: 0.38, send: 0 });
    if (i >= 2) {
      for (const at of [0, 2.5]) mx.add(kick({ vel: 0.7, decay: 8 }), t0 + sw(at) * b, { gain: 0.56, send: 0.02 });
      for (const at of [1, 3]) mx.add(snare({ vel: 0.45, tone: 200, len: 0.25 }), t0 + at * b, { gain: 0.45, send: 0.15 });
      for (let k = 0; k < 8; k++) mx.add(hat({ vel: k % 2 ? 0.2 : 0.3 }), t0 + sw(k / 2) * b, { gain: 0.4, pan: 0.25, send: 0.05 });
    }
    if (i >= 8 && i < 15) for (const [m, at, d] of lead[i % 4]) mx.add(epiano(m, d * b, 0.65), t0 + sw(at) * b, { gain: 0.3, pan: 0.1, send: 0.35 });
  }
  // vinyl crackle on its own bus
  const crackle = new Float32Array(mx.n);
  for (let i = 0; i < mx.n; i++) crackle[i] = (rnd() < 0.0009 ? (rnd() * 2 - 1) * 0.5 : 0) + (rnd() * 2 - 1) * 0.004;
  filt(crackle, "bp", 3000, 0.5);
  mx.add(crackle, 0, { gain: 0.8, send: 0, bus: "fx" });
  // dusty: low-pass the band
  const main = mx.get("main");
  filt(main.L, "lp", 5200); filt(main.R, "lp", 5200);
  return master(mx, { verb: { room: 0.6, damp: 0.6 }, fadeOut: 3, targetRms: 0.13 });
};

// 6. Dance energy — four-on-the-floor house, pumping chords, arpeggio.
tracks.energy = () => {
  setSeed(66);
  const bpm = 124, b = 60 / bpm, bar = 4 * b;
  const prog = ["Am", "F", "C", "G"];
  const bars = 24;
  const mx = new Mix(bars * bar + 2);
  for (let i = 0; i < bars; i++) {
    const t0 = i * bar;
    const name = prog[i % 4];
    const tri = chord(name, 4);
    const r1 = chord(name, 2)[0];
    const build = Math.min(1, i / 12);
    const drop = i >= 12;
    for (let k = 0; k < 4; k++) mx.add(kick({ vel: 1 }), t0 + k * b, { gain: 0.78, send: 0, bus: "kick" });
    for (let k = 0; k < 4; k++) mx.add(hat({ vel: 0.4, open: true }), t0 + (k + 0.5) * b, { gain: 0.35, pan: 0.2, send: 0.05 });
    for (let k = 0; k < 16; k++) mx.add(hat({ vel: k % 2 ? 0.18 : 0.12 }), t0 + k * b / 4, { gain: 0.45, pan: -0.25, send: 0 });
    if (i >= 4) for (const at of [1, 3]) mx.add(clap({ vel: 0.75 }), t0 + at * b, { gain: 0.55, send: 0.2 });
    if (i >= 4) for (let k = 0; k < 4; k++) mx.add(bass(r1 + 12, b * 0.4, { vel: 0.9, drive: 2.2 }), t0 + (k + 0.5) * b, { gain: 0.4, send: 0, bus: "pump" });
    for (const m of tri) mx.add(synth(m, bar * 0.98, { cutoff: 500 + 2600 * build + (drop ? 1500 : 0), envAmt: 600, fdec: 2, q: 0.9, attack: 0.01, release: 0.2, detune: 0.009, vel: 0.6 }), t0, { gain: 0.14, pan: (m % 3 - 1) * 0.4, send: 0.25, bus: "pump" });
    if (drop) {
      const arp = [tri[0] + 12, tri[2] + 12, tri[1] + 12, tri[2] + 12];
      for (let k = 0; k < 16; k++) mx.add(synth(arp[k % 4], b / 4 * 0.8, { cutoff: 1200, envAmt: 3500, fdec: 18, q: 1.3, vel: k % 4 === 0 ? 0.7 : 0.5 }), t0 + k * b / 4, { gain: 0.15, pan: k % 2 ? 0.35 : -0.35, send: 0.25 });
    }
    if (i === 12) mx.add(crash({ vel: 0.4 }), t0, { gain: 0.6, send: 0.2 });
  }
  duck(mx.get("pump"), b, 0, 0.7, mx.n);
  duck(mx.get("verb"), b, 0, 0.4, mx.n);
  return master(mx, { verb: { room: 0.7, damp: 0.5 }, fadeOut: 2.5, targetRms: 0.16 });
};

const only = process.argv[3];
for (const [id, fn] of Object.entries(tracks)) {
  if (only && only !== id) continue;
  const t0 = Date.now();
  const res = fn();
  let peak = 0, sq = 0;
  for (let i = 0; i < res.L.length; i++) { peak = Math.max(peak, Math.abs(res.L[i]), Math.abs(res.R[i])); sq += res.L[i] ** 2; }
  writeFileSync(`${out}/${id}.wav`, wav(res));
  console.log(id, (res.L.length / SR).toFixed(1) + "s", "peak", peak.toFixed(2), "rms", Math.sqrt(sq / res.L.length).toFixed(3), (Date.now() - t0) + "ms");
}
