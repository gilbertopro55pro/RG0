import { describe, expect, it } from "vitest";
import { firstBeatAtOrAfter, lengthThatFits, soundSpan, soundSpanFromBuffer } from "./recording";
import { detectTempoFromBuffer } from "./tempo";

const RATE = 8000;

// A song-like signal: a decaying kick (and a softer hat between) on every beat, over a quiet pad.
function song(seconds: number, bpm: number, firstBeat = 0, level = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  const P = 60 / bpm;
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] = 0.05 * level * Math.sin(2 * Math.PI * 220 * t);
  }
  for (let b = firstBeat; b < seconds; b += P) {
    for (const [at, amp, freq] of [
      [b, 1, 60],
      [b + P / 2, 0.35, 0],
    ] as const) {
      const s0 = Math.round(at * RATE);
      for (let k = 0; k < RATE * 0.12 && s0 + k < out.length; k++) {
        const env = Math.exp(-k / (RATE * 0.03));
        out[s0 + k] += level * amp * env * (freq ? Math.sin((2 * Math.PI * freq * k) / RATE) : noise());
      }
    }
  }
  return out;
}

// silence (s) → the song → silence (s), like a screen recording of a reel.
function recording(lead: number, songSeconds: number, tail: number, bpm = 120): Float32Array {
  const body = song(songSeconds, bpm);
  const out = new Float32Array(Math.round((lead + songSeconds + tail) * RATE));
  out.set(body, Math.round(lead * RATE));
  return out;
}

function fakeBuffer(samples: Float32Array): AudioBuffer {
  return { length: samples.length, sampleRate: RATE, numberOfChannels: 1, duration: samples.length / RATE, getChannelData: () => samples } as unknown as AudioBuffer;
}

describe("soundSpan", () => {
  it("finds where the song starts and ends after the silence of opening the app", () => {
    const span = soundSpan(recording(1.5, 12, 0.8), RATE)!;
    expect(span.start).toBeGreaterThanOrEqual(1.48);
    expect(span.start).toBeLessThanOrEqual(1.56);
    expect(span.end).toBeGreaterThan(13.3);
    expect(span.end).toBeLessThanOrEqual(13.56);
  });

  it("a recording that starts in the middle of the song starts at 0", () => {
    expect(soundSpan(song(10, 100), RATE)!.start).toBe(0);
  });

  it("a tap or a notification blip before the song doesn't count", () => {
    const x = recording(2, 8, 0);
    for (let k = 0; k < RATE * 0.1; k++) x[Math.round(0.6 * RATE) + k] = 0.6 * Math.sin(k / 3);
    const span = soundSpan(x, RATE)!;
    expect(span.start).toBeGreaterThanOrEqual(1.98);
  });

  it("silence, or too little song to cut on, is no song", () => {
    expect(soundSpan(new Float32Array(RATE * 5), RATE)).toBeNull();
    expect(soundSpan(recording(3, 2, 1), RATE)).toBeNull();
    // A hiss far below any song.
    const hiss = new Float32Array(RATE * 5).map((_, i) => 0.00002 * Math.sin(i));
    expect(soundSpan(hiss, RATE)).toBeNull();
  });

  it("works on a decoded buffer", () => {
    expect(soundSpanFromBuffer(fakeBuffer(recording(1, 6, 0)))!.start).toBeCloseTo(1, 1);
  });
});

describe("the beat of a recording", () => {
  it("finds the tempo from where the song starts, with the first beat on the whole file's grid", () => {
    const x = recording(1.37, 14, 0.5, 120);
    const buffer = fakeBuffer(x);
    const span = soundSpanFromBuffer(buffer)!;
    const found = detectTempoFromBuffer(buffer, span.start)!;
    expect(found.bpm).toBeCloseTo(120, 0);
    // The kicks are at 1.37 + k·0.5 s, so the grid's first beat is 0.37 into the file.
    expect(Math.abs(found.firstBeat - 0.37)).toBeLessThan(0.03);
    // The reel starts on the song's first beat, not in the silence before it.
    expect(Math.abs(firstBeatAtOrAfter(span.start, found.bpm, found.firstBeat) - 1.37)).toBeLessThan(0.03);
  });
});

describe("firstBeatAtOrAfter", () => {
  it("is the first beat at or just after the point", () => {
    expect(firstBeatAtOrAfter(1.5, 120, 0.25)).toBe(1.75);
    expect(firstBeatAtOrAfter(1.74, 120, 0.25)).toBe(1.75);
    // A hair after a beat counts as on it.
    expect(firstBeatAtOrAfter(1.77, 120, 0.25)).toBe(1.75);
    expect(firstBeatAtOrAfter(0, 120, 0.25)).toBe(0.25);
  });
});

describe("lengthThatFits", () => {
  it("is the longest reel the song in the recording covers", () => {
    expect(lengthThatFits(16)).toBe(15);
    expect(lengthThatFits(14.8)).toBe(15);
    expect(lengthThatFits(29)).toBe(15);
    expect(lengthThatFits(61)).toBe(60);
    expect(lengthThatFits(4)).toBeNull();
  });
});
