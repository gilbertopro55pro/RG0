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

// `loop: false` (a screen recording, recording.ts): the song plays once and fades out where the
// recording's song ends, if that's before the reel does, instead of starting again from the
// recording's silent opening.
export async function renderSoundtrack(buffer: AudioBuffer, opts: { offset: number; total: number; volume: number; loop?: boolean; end?: number }): Promise<AudioBuffer> {
  const { total, volume } = opts;
  const loop = opts.loop !== false;
  const offset = Math.max(0, opts.offset) % buffer.duration;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = loop;
  src.loopStart = 0;
  src.loopEnd = buffer.duration;
  const gain = ctx.createGain();
  // Where the sound stops: the reel's end, or (playing once) the song's end in the file.
  const stop = loop ? total : Math.max(0.1, Math.min(total, (opts.end ?? buffer.duration) - offset));
  const fadeIn = Math.min(0.25, stop * 0.05);
  const fadeOut = Math.min(1.5, stop * 0.25);
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(volume, fadeIn);
  gain.gain.setValueAtTime(volume, Math.max(fadeIn, stop - fadeOut));
  gain.gain.linearRampToValueAtTime(0, stop);
  src.connect(gain).connect(ctx.destination);
  src.start(0, offset);
  return ctx.startRendering();
}

// Only the sound of a video (a screen recording of a reel, recording.ts), as a small M4A that
// decodeAudioData reads in every browser: the audio track is copied out of the file without the
// video, reading only the parts of the file it needs (a 30-second recording can be 80MB). A file
// Mediabunny can't read this way is decoded whole, as before.
export class NoSoundError extends Error {}
export async function recordingAudio(file: File): Promise<ArrayBuffer> {
  if (file.type.startsWith("audio/")) return file.arrayBuffer();
  const { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS } = await import("mediabunny");
  let input: InstanceType<typeof Input> | null = null;
  try {
    input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    if (!(await input.getPrimaryAudioTrack())) throw new NoSoundError("no audio track");
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const conversion = await Conversion.init({ input, output, video: { discard: true }, showWarnings: false });
    if (conversion.isValid) {
      await conversion.execute();
      if (target.buffer) return target.buffer;
    }
  } catch (e) {
    if (e instanceof NoSoundError) throw e;
  } finally {
    input?.dispose();
  }
  return file.arrayBuffer();
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

  // Starts the track so that reel time `t` plays `offset + t` seconds into it. `loop: false` (a
  // screen recording) plays it once: past its end the preview is silent, like the file.
  play(buffer: AudioBuffer, t: number, offset: number, loop = true) {
    const ctx = this.ensure();
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.connect(this.gain!);
    const at = Math.max(0, offset + t);
    src.start(0, loop ? at % buffer.duration : Math.min(at, buffer.duration));
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
