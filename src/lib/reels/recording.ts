// A screen recording of a reel with the song the photographer wants (owner, 2026-11-04: "a user
// sees a video with music they want, … the system takes only the music and puts the cuts exactly
// on the beat"). A link to a post on Instagram or TikTok can't give the music (the platforms block
// downloads, their terms forbid it, and the song is copyrighted), so the photographer records the
// reel on the phone's screen and picks the recording: only its sound is read, in the browser.
//
// The recording starts before the reel plays (opening the app, a moment of silence) and may end
// with the reel restarting or the recorder's own stop. `soundSpan` finds where the song plays: the
// first and the last stretch of sustained sound, so a tap or a notification blip doesn't count.
// The beat is then found by tempo.ts from that point on, and the reel starts on its first beat.

import { REEL_LENGTHS, type ReelLength } from "./templates";

export type SoundSpan = { start: number; end: number };

// The RMS envelope's frame (seconds).
const FRAME = 0.02;
// Sound must hold this long to count as the song (a click or a short notification doesn't).
const SUSTAIN = 0.4;
// Of the frames in that window, this share must be above the threshold (a song has short dips).
const SUSTAIN_SHARE = 0.7;
// Quieter than this, against the song's loud level, is not the song (-26 dB).
const REL_THRESHOLD = 0.05;
// A recording with less song than this has too few beats to cut on.
export const MIN_SONG_SECONDS = 3;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Where the song plays in a recording (seconds), or null when there's no sustained sound. */
export function soundSpan(samples: Float32Array, sampleRate: number): SoundSpan | null {
  if (!(sampleRate >= 1000)) return null;
  const hop = Math.max(1, Math.round(sampleRate * FRAME));
  const frames = Math.floor(samples.length / hop);
  const win = Math.max(2, Math.round(SUSTAIN / FRAME));
  if (frames < win) return null;
  const rms = new Float32Array(frames);
  for (let f = 0, i = 0; f < frames; f++) {
    let s = 0;
    for (const end = i + hop; i < end; i++) s += samples[i] * samples[i];
    rms[f] = Math.sqrt(s / hop);
  }
  const sorted = Float32Array.from(rms).sort();
  // The song's level: its loud frames (it may fill only a part of the recording).
  const loud = sorted[Math.min(frames - 1, Math.floor(frames * 0.95))];
  // Digital silence or a hiss far below any song (-80 dBFS).
  if (!(loud > 1e-4)) return null;
  // Against the song's own level only: a song filling the whole recording has quiet frames of its
  // own (between the kicks), and those are still the song.
  const threshold = Math.max(loud * REL_THRESHOLD, 1e-4);
  const need = Math.ceil(win * SUSTAIN_SHARE);
  const on = new Uint8Array(frames);
  for (let f = 0; f < frames; f++) on[f] = rms[f] > threshold ? 1 : 0;
  const pre = new Int32Array(frames + 1);
  for (let f = 0; f < frames; f++) pre[f + 1] = pre[f] + on[f];
  const count = (a: number, b: number) => pre[Math.min(frames, b)] - pre[Math.max(0, a)];
  let first = -1;
  for (let f = 0; f + win <= frames; f++) {
    if (on[f] && count(f, f + win) >= need) {
      first = f;
      break;
    }
  }
  if (first < 0) return null;
  let last = -1;
  for (let f = frames - 1; f - win + 1 >= 0; f--) {
    if (on[f] && count(f - win + 1, f + 1) >= need) {
      last = f;
      break;
    }
  }
  if (last < first) return null;
  const span = { start: round3((first * hop) / sampleRate), end: round3(((last + 1) * hop) / sampleRate) };
  return span.end - span.start >= MIN_SONG_SECONDS ? span : null;
}

/** The decoded recording's span: the channels averaged, then soundSpan. */
export function soundSpanFromBuffer(buffer: AudioBuffer): SoundSpan | null {
  const n = buffer.length;
  const channels = buffer.numberOfChannels;
  if (!n || !channels) return null;
  const mono = new Float32Array(n);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += data[i];
  }
  if (channels > 1) for (let i = 0; i < n; i++) mono[i] /= channels;
  return soundSpan(mono, buffer.sampleRate);
}

/** The first beat at or after `at` (a hair before counts), on the grid of `bpm` from `firstBeat`. */
export function firstBeatAtOrAfter(at: number, bpm: number, firstBeat: number): number {
  const P = 60 / bpm;
  const k = Math.max(0, Math.ceil((at - firstBeat - 0.03) / P));
  return round3(firstBeat + k * P);
}

/** The longest reel length that the song in the recording covers, or null when none does. */
export function lengthThatFits(seconds: number): ReelLength | null {
  let best: ReelLength | null = null;
  for (const l of REEL_LENGTHS) if (l <= seconds + 0.25) best = l;
  return best;
}
