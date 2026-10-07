// The reel's soundtrack: a library track or the photographer's own file, decoded once, then for
// the export rendered to exactly the reel's length (starting at the chosen point, looping if the
// track is shorter, faded in and out, at the chosen volume). The preview plays the same track
// through an <audio> element and follows the same fades (see musicGain).

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
