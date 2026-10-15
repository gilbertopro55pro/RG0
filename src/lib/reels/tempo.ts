// The tempo and beat grid of a song the photographer uploads (2026-10-15). Library tracks carry
// their BPM (music.ts); an uploaded file doesn't, so we listen to its opening minute and find the
// beat grid ourselves, and the builder can cut on the beat with any song. Plain TypeScript on the
// decoded samples (no Web Audio, no packages), fast enough to run right after decoding.
//
// How: an onset envelope at ~100 frames a second (how much louder each of seven octave bands just
// got, so a kick, a clap or a new piano note all count), its autocorrelation for the tempo
// candidates, then for each candidate the grid (exact tempo and phase) that lands the most onset
// strength on its beats. A song with no steady beat (a rubato piano piece, noise) returns null and
// the builder cuts without a grid.

export type DetectedTempo = { bpm: number; firstBeat: number; confidence: number };

const MIN_BPM = 70;
const MAX_BPM = 160;
// Only the opening minute: plenty of beats for a precise tempo, and quick on a 5-minute song.
const MAX_SECONDS = 60;
// Shorter than this there are too few beats to trust.
const MIN_SECONDS = 5;
// Most event and wedding pop sits around here; a mild pull towards it settles a close call between
// a tempo and its 2:3 or 3:2 neighbour (a 118 song whose kick pattern also fits 78.7).
const PRIOR_BPM = 115;
// Below this the best grid doesn't explain the song's onsets (rubato, noise, a drone).
const MIN_CONFIDENCE = 0.3;
// Octave band centres (Hz) for the onset envelope; the lowest one is where the kick lives.
const BANDS = [60, 120, 240, 480, 960, 1920, 3840];

type Envelopes = { full: Float32Array; kick: Float32Array; fps: number; flux: number };
type Grid = { bpm: number; phase: number; score: number };

export function detectTempo(samples: Float32Array, sampleRate: number): DetectedTempo | null {
  if (!(sampleRate >= 4000)) return null;
  const env = onsetEnvelopes(samples, sampleRate);
  if (!env) return null;
  const { full, kick, fps } = env;
  const n = full.length;
  // A steady tone or near silence barely changes: whatever "beat" its envelope has is numerical noise.
  if (n < MIN_SECONDS * fps || env.flux < 0.25) return null;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += full[i];
  mean /= n;
  if (!(mean > 0)) return null;

  // Tempo candidates: peaks of the envelope's autocorrelation at one and two beats.
  const maxLag = Math.ceil((2 * 60 * fps) / MIN_BPM) + 1;
  const acf = autocorrelation(full, mean, maxLag);
  if (!acf) return null;
  const salience: number[] = [];
  for (let b10 = MIN_BPM * 10; b10 <= MAX_BPM * 10; b10++) {
    const lag = (60 * fps) / (b10 / 10);
    salience.push(lerp(acf, lag) + 0.5 * lerp(acf, 2 * lag));
  }
  const peaks: { bpm: number; s: number }[] = [];
  for (let i = 0; i < salience.length; i++) {
    const s = salience[i];
    if (s > 0 && (i === 0 || s >= salience[i - 1]) && (i === salience.length - 1 || s > salience[i + 1])) peaks.push({ bpm: MIN_BPM + i / 10, s });
  }
  peaks.sort((a, b) => b.s - a.s);
  if (!peaks.length) return null;

  // Each candidate's best grid; the one landing the most onset strength on its beats wins. Counted
  // per minute (the excess over the average, times the beats), not per beat: per beat, a grid on
  // every 4/3 beats that hits only the strongest kicks of a syncopated pattern would beat the real
  // one, which also has to land on the weaker snares.
  const es = smooth(full);
  let best: Grid | null = null;
  let bestScore = -Infinity;
  for (const p of peaks.slice(0, 5)) {
    const g = fitGrid(es, fps, p.bpm * 0.988, p.bpm * 1.012, 0.08, 1);
    const score = (g.score - 1) * g.bpm * prior(g.bpm);
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  if (!best) return null;

  // Octaves: 70–80 and 140–160 both fit the range, and both grids land on beats, so the scores
  // can't settle it. Take the slow one and double it only when its off-beats are as strong as its
  // beats, kick included (a four-on-the-floor dance track), not just a busier part on eighths (a
  // ballad's arpeggio, which must stay 72 rather than 144). A fast backbeat (kick 1 and 3, snare 2
  // and 4) stays half-time: every cut still lands on a beat.
  let grid = best;
  if (grid.bpm >= 2 * MIN_BPM) grid = fitGrid(es, fps, grid.bpm / 2 - 0.15, grid.bpm / 2 + 0.15, 0.03, 1);
  if (grid.bpm * 2 <= MAX_BPM + 0.5) {
    const ek = smooth(kick);
    const P = (60 * fps) / grid.bpm;
    const fullRatio = combAt(es, P, grid.phase + P / 2) / Math.max(1e-9, combAt(es, P, grid.phase));
    const kickRatio = combAt(ek, P, grid.phase + P / 2) / Math.max(1e-9, combAt(ek, P, grid.phase));
    if (fullRatio >= 0.75 && kickRatio >= 0.75) {
      const doubled = fitGrid(es, fps, grid.bpm * 2 - 0.3, Math.min(MAX_BPM, grid.bpm * 2 + 0.3), 0.03, 1);
      if (doubled.score > 0) grid = doubled;
    }
  }

  // Refine the tempo, round it to 0.1 BPM, then fit the phase to the rounded tempo, so the grid the
  // caller builds from (bpm, firstBeat) is the one that matches the song best.
  // (A small tempo change moves the best phase by a frame or two, hence the windows.)
  const fine = fitGrid(es, fps, grid.bpm - 0.08, grid.bpm + 0.08, 0.01, 0.1, grid.phase, 4);
  const bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(fine.bpm * 10) / 10));
  const final = fitGrid(es, fps, bpm, bpm, 1, 0.05, fine.phase, 2.5);
  const P = (60 * fps) / bpm;

  const confidence = gridConfidence(es, P, final.phase);
  if (confidence < MIN_CONFIDENCE) return null;
  const period = 60 / bpm;
  let firstBeat = Math.round(((final.phase / fps) % period) * 1000) / 1000;
  // A beat a hair before the end of the first period is the one at 0 (and must stay below a period).
  if (firstBeat >= period - 0.0005) firstBeat = 0;
  return { bpm, firstBeat, confidence: Math.round(confidence * 100) / 100 };
}

// The browser's decoded track: the channels averaged (the opening minute only), then detectTempo.
export function detectTempoFromBuffer(buffer: AudioBuffer): DetectedTempo | null {
  const n = Math.min(buffer.length, Math.floor(MAX_SECONDS * buffer.sampleRate));
  const channels = buffer.numberOfChannels;
  if (!n || !channels) return null;
  const mono = new Float32Array(n);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += data[i];
  }
  if (channels > 1) for (let i = 0; i < n; i++) mono[i] /= channels;
  return detectTempo(mono, buffer.sampleRate);
}

// Onset strength per ~10 ms frame: in each octave band, how much the log energy rose since the
// previous frame (falls don't count). Log, so a quiet note entering counts like a loud one, but
// relative to the whole song's level, so a near-empty band's noise counts for little. `kick` is
// the lowest band alone, for the octave decision. Returns null for silence.
function onsetEnvelopes(samples: Float32Array, sampleRate: number): Envelopes | null {
  const total = Math.min(samples.length, Math.floor(MAX_SECONDS * sampleRate));
  // Down to ~11 kHz by averaging blocks of samples: the bands stop below 5.5 kHz, and it's 4×
  // less filtering work.
  const dec = Math.max(1, Math.round(sampleRate / 11025));
  const rate = sampleRate / dec;
  const m = Math.floor(total / dec);
  const x = new Float32Array(m);
  for (let i = 0, j = 0; i < m; i++) {
    let s = 0;
    for (let k = 0; k < dec; k++) s += samples[j++];
    x[i] = s / dec;
  }
  const hop = Math.max(1, Math.round(rate / 100));
  const fps = rate / hop;
  const frames = Math.floor(m / hop);
  if (frames < 2) return null;
  const centres = BANDS.filter((f) => f < rate * 0.4);
  const energy = new Float64Array(centres.length * frames);
  let sum = 0;
  centres.forEach((fc, b) => {
    // Band-pass biquad (RBJ, 0 dB peak, Q 1: about an octave and a half wide).
    const w0 = (2 * Math.PI * fc) / rate;
    const alpha = Math.sin(w0) / 2;
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, i = 0;
    for (let f = 0; f < frames; f++) {
      let e = 0;
      for (const end = i + hop; i < end; i++) {
        const xi = x[i];
        const y = b0 * (xi - x2) - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = xi;
        y2 = y1;
        y1 = y;
        e += y * y;
      }
      energy[b * frames + f] = e;
      sum += e;
    }
  });
  const level = sum / (centres.length * frames);
  if (!(level > 1e-10)) return null;
  const gain = 100 / level;
  const full = new Float32Array(frames);
  const kick = new Float32Array(frames);
  let flux = 0;
  for (let b = 0; b < centres.length; b++) {
    // The two low bands count a bit more: kicks and bass carry the beat.
    const w = b < 2 ? 1.5 : 1;
    let prev = Math.log(1 + gain * energy[b * frames]);
    for (let f = 1; f < frames; f++) {
      const l = Math.log(1 + gain * energy[b * frames + f]);
      const d = l - prev;
      prev = l;
      if (d <= 0) continue;
      full[f] += w * d;
      if (b === 0) kick[f] += d;
      flux += w * d;
    }
  }
  return { full: detrend(full, fps), kick: detrend(kick, fps), fps, flux: flux / frames };
}

// What sticks out above the local average (~1 s around), so a crescendo or a dense passage isn't
// mistaken for beats.
function detrend(env: Float32Array, fps: number): Float32Array {
  const n = env.length;
  const half = Math.round(fps * 0.5);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + env[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    const v = env[i] - (pre[b] - pre[a]) / (b - a);
    out[i] = v > 0 ? v : 0;
  }
  return out;
}

// A light blur (~20 ms) so a beat landing a frame off, or a hit with a soft attack, still counts.
function smooth(env: Float32Array): Float32Array {
  const n = env.length;
  const k = [0.0545, 0.2442, 0.4026, 0.2442, 0.0545];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -2; j <= 2; j++) {
      const t = i + j;
      if (t >= 0 && t < n) s += k[j + 2] * env[t];
    }
    out[i] = s;
  }
  return out;
}

// Normalised autocorrelation of the mean-removed envelope (1 at lag 0), lags 0..maxLag frames.
function autocorrelation(env: Float32Array, mean: number, maxLag: number): Float64Array | null {
  const n = env.length;
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = env[i] - mean;
  const r = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag && lag < n; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += z[i] * z[i - lag];
    r[lag] = s / (n - lag);
  }
  if (!(r[0] > 0)) return null;
  for (let lag = maxLag; lag >= 0; lag--) r[lag] /= r[0];
  return r;
}

// Linear interpolation into an array at a fractional index (clamped at the end).
function lerp(a: ArrayLike<number>, x: number): number {
  const i = Math.floor(x);
  if (i >= a.length - 1) return a[a.length - 1];
  if (i < 0) return a[0];
  const f = x - i;
  return a[i] + (a[i + 1] - a[i]) * f;
}

// A mild preference for tempos near PRIOR_BPM (log-Gaussian, one octave wide).
function prior(bpm: number): number {
  const o = Math.log2(bpm / PRIOR_BPM);
  return Math.exp(-0.5 * o * o);
}

// The average envelope on the beats of the grid with period P (frames) starting at `phase`.
function combAt(env: Float32Array, P: number, phase: number): number {
  const last = env.length - 1;
  let s = 0;
  let k = 0;
  for (let t = phase; t < last; t += P) {
    const i = Math.floor(t);
    s += env[i] + (env[i + 1] - env[i]) * (t - i);
    k++;
  }
  return k ? s / k : 0;
}

// The grid with the most onset strength on its beats: tempo from lo to hi BPM in `step`s, phase
// (frames) in `phaseStep`s, anywhere in a beat or only within `span` frames of `near`. `score` is
// that average relative to the envelope's own average.
function fitGrid(env: Float32Array, fps: number, lo: number, hi: number, step: number, phaseStep: number, near = -1, span = 0): Grid {
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean = Math.max(1e-12, mean / env.length);
  let best: Grid = { bpm: lo, phase: 0, score: 0 };
  for (let bpm = lo; bpm <= hi + 1e-9; bpm += step) {
    const P = (60 * fps) / bpm;
    const from = near < 0 ? 0 : near - span;
    const count = near < 0 ? Math.ceil(P / phaseStep) : Math.round((2 * span) / phaseStep) + 1;
    for (let k = 0; k < count; k++) {
      const phase = (((from + k * phaseStep) % P) + P) % P;
      const c = combAt(env, P, phase) / mean;
      if (c > best.score) best = { bpm, phase, score: c };
    }
  }
  return best;
}

// How well the final grid explains the song (0–1). Two parts, both near 1 for a real beat:
// - capture: on each beat, the onset at the beat against the strongest one within a quarter beat
//   either side, summed over the song (a grid that drifts off the hits, or rubato, scores low);
// - contrast: the grid's phase against a typical phase (noise gives every phase about the same).
function gridConfidence(es: Float32Array, P: number, phase: number): number {
  const n = es.length;
  let atBeat = 0;
  let nearBest = 0;
  for (let t = phase; t < n - 1; t += P) {
    atBeat += lerp(es, t);
    const a = Math.max(0, Math.ceil(t - P / 4));
    const b = Math.min(n - 1, Math.floor(t + P / 4));
    let mx = 0;
    for (let j = a; j <= b; j++) if (es[j] > mx) mx = es[j];
    nearBest += Math.max(mx, lerp(es, t));
  }
  const capture = nearBest > 0 ? atBeat / nearBest : 0;
  const profile: number[] = [];
  for (let p = 0; p < P; p += 0.5) profile.push(combAt(es, P, p));
  profile.sort((a, b) => a - b);
  const median = profile[Math.floor(profile.length / 2)];
  const top = combAt(es, P, phase);
  const contrast = top > 0 ? Math.max(0, (top - median) / top) : 0;
  return Math.min(1, Math.max(0, capture * contrast));
}
