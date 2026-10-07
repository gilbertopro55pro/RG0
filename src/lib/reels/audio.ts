// The reel's soundtrack: a library track or the photographer's own file, decoded once, then for
// the export rendered to exactly the reel's length (starting at the chosen point, looping if the
// track is shorter, faded in and out, at the chosen volume). The preview plays the same decoded
// track through Web Audio (PreviewMusic), and the picture follows the music's clock.

const SAMPLE_RATE = 48000;

let decodeCtx: AudioContext | null = null;
const decoded = new Map<string, Promise<AudioBuffer>>();

// Decodes a track (cached by key, e.g. its URL or the uploaded file's name and size).
export function decodeTrack(key: string, load: () => Promise<ArrayBuffer>): Promise<AudioBuffer> {
  let p = decoded.get(key);
  if (!p) {
    p = load().then((data) => {
      decodeCtx ??= new AudioContext();
      return decodeCtx.decodeAudioData(data);
    });
    p.catch(() => decoded.delete(key));
    decoded.set(key, p);
  }
  return p;
}

// The volume at time t of a reel `total` seconds long: a short fade in, a longer fade out.
export function musicGain(t: number, total: number, volume: number): number {
  const fadeIn = Math.min(0.25, total * 0.05);
  const fadeOut = Math.min(1.5, total * 0.25);
  const g = Math.min(1, t / fadeIn, (total - t) / fadeOut);
  return Math.max(0, g) * volume;
}

export async function renderSoundtrack(buffer: AudioBuffer, opts: { offset: number; total: number; volume: number }): Promise<AudioBuffer> {
  const { total, volume } = opts;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = buffer.duration;
  const gain = ctx.createGain();
  const fadeIn = Math.min(0.25, total * 0.05);
  const fadeOut = Math.min(1.5, total * 0.25);
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(volume, fadeIn);
  gain.gain.setValueAtTime(volume, Math.max(fadeIn, total - fadeOut));
  gain.gain.linearRampToValueAtTime(0, total);
  src.connect(gain).connect(ctx.destination);
  src.start(0, Math.max(0, opts.offset) % buffer.duration);
  return ctx.startRendering();
}

// The preview's music. It plays the decoded track without interruption and is the preview's
// clock: the picture is drawn at the music's time, never the other way round. (The first version
// nudged an <audio> element to follow the picture, and every nudge was an audible jump — owner,
// 2026-10-07: "the music sounds choppy".)
export class PreviewMusic {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private startedT = 0;

  private ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  // Browsers start audio only after a tap; call this from one. Resolves true when the audio was
  // asleep and has just woken (the music then has to restart at the preview's time).
  async resume(): Promise<boolean> {
    const ctx = this.ensure();
    if (ctx.state === "running") return false;
    try {
      await ctx.resume();
    } catch {
      return false;
    }
    return true;
  }

  get running() {
    return !!this.ctx && this.ctx.state === "running" && !!this.src;
  }

  // Starts the track so that reel time `t` plays `offset + t` seconds into it.
  play(buffer: AudioBuffer, t: number, offset: number) {
    const ctx = this.ensure();
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.gain!);
    src.start(0, (Math.max(0, offset + t)) % buffer.duration);
    this.src = src;
    this.startedAt = ctx.currentTime;
    this.startedT = t;
  }

  // The reel time the music is at now.
  time() {
    return this.ctx ? this.startedT + (this.ctx.currentTime - this.startedAt) : 0;
  }

  setGain(v: number) {
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  stop() {
    if (this.src) {
      try {
        this.src.stop();
      } catch {
        // already stopped
      }
      this.src.disconnect();
      this.src = null;
    }
  }

  close() {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
