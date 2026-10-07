import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, canEncodeVideo } from "mediabunny";

// The reel as a real MP4 (H.264), made in the browser with the device's own video encoder through
// WebCodecs (Mediabunny, MPL-2.0: no server, no upload, works on phones with a recent browser).
// Every frame is drawn by `draw(t)` onto `canvas` and encoded at FPS.

export const REEL_FPS = 30;

export class ReelUnsupportedError extends Error {}
export class ReelCancelledError extends Error {}

export async function exportReelMp4(opts: {
  canvas: HTMLCanvasElement;
  total: number;
  draw: (t: number) => void;
  onProgress?: (fraction: number) => void;
  isCancelled?: () => boolean;
}): Promise<Blob> {
  const { canvas, total, draw } = opts;
  if (typeof window === "undefined" || !("VideoEncoder" in window)) throw new ReelUnsupportedError("no-webcodecs");
  // MP4/H.264 is what Instagram, TikTok and Facebook take. A browser without an H.264 encoder
  // (open-source Chromium builds) falls back to WebM/VP9, which still plays and shares but may
  // need converting before upload.
  const size = { width: canvas.width, height: canvas.height };
  const mp4 = await canEncodeVideo("avc", size);
  if (!mp4 && !(await canEncodeVideo("vp9", size))) throw new ReelUnsupportedError("no-codec");

  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: mp4 ? "avc" : "vp9", bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: REEL_FPS });
  await output.start();
  const frames = Math.max(1, Math.round(total * REEL_FPS));
  const dt = 1 / REEL_FPS;
  for (let i = 0; i < frames; i++) {
    if (opts.isCancelled?.()) {
      await output.cancel();
      throw new ReelCancelledError("cancelled");
    }
    const t = i * dt;
    draw(t);
    await source.add(t, dt);
    if (i % 6 === 0) opts.onProgress?.(i / frames);
  }
  await output.finalize();
  opts.onProgress?.(1);
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("empty");
  return new Blob([buffer], { type: mp4 ? "video/mp4" : "video/webm" });
}
