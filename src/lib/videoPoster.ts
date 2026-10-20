"use client";

// A still frame of a video, as a JPEG, for its poster (api/galleries/<id>/videos/<id>/poster): about
// a second in (past a fade from black), at most 1200px. The video comes from the storage with CORS
// (crossOrigin), so the canvas can be read. null when the browser can't decode or read it (e.g. a
// codec it doesn't play): the next visit tries again.
export async function captureVideoPoster(url: string, timeoutMs = 20000): Promise<Blob | null> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const once = (event: string) =>
    new Promise<void>((resolve, reject) => {
      video.addEventListener(event, () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("video error")), { once: true });
    });
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs));
  try {
    video.src = url;
    await Promise.race([once("loadeddata"), timeout]);
    const at = Math.min(1, (video.duration || 0) * 0.1);
    if (at > 0) {
      video.currentTime = at;
      await Promise.race([once("seeked"), timeout]);
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 1200 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85));
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
