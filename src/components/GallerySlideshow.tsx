"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconClose } from "@/components/icons/AlbumIcons";
import { useLang, useT } from "@/i18n/client";
import { dirOf } from "@/i18n/config";
import {
  ENTRANCE_SECONDS,
  SLIDE_SECONDS,
  SlideshowVideoError,
  exportSlideshowVideo,
  randomEffects,
  slideshowFileName,
  type SlideEffect,
} from "@/lib/slideshowVideo";
import { makeShowPlan, newShowSeed } from "@/lib/slideshow3d/plan";
import type { ShowPlayer } from "@/lib/slideshow3d/player";

type SlidePhoto = { id: string; url: string };

const SLIDE_MS = SLIDE_SECONDS * 1000;
const ENTRANCE_MS = ENTRANCE_SECONDS * 1000;
const ENTRANCE = `${ENTRANCE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`;

// The same effects the video draws (lib/slideshowVideo.ts, slidePose): change both together.
const ANIMATIONS: Record<SlideEffect, string> = {
  "kenburns-in": `gs-kenburns-in ${SLIDE_MS}ms ease-out forwards`,
  "kenburns-out": `gs-kenburns-out ${SLIDE_MS}ms ease-out forwards`,
  "fade-punch": `gs-fade-punch ${ENTRANCE}`,
  "slide-left": `gs-slide-left ${ENTRANCE}`,
  "slide-right": `gs-slide-right ${ENTRANCE}`,
  "slide-up": `gs-slide-up ${ENTRANCE}`,
  "slide-down": `gs-slide-down ${ENTRANCE}`,
  "rotate-in": `gs-rotate-in ${ENTRANCE}`,
  "circle-reveal": `gs-circle-reveal ${ENTRANCE}`,
};

// The download button makes the slideshow a video file (owner, 2026-11-02: "צריך להוריד את המצגת
// כקובץ mp4 ולא פותח את האפשרות של הורדת התמונות"), in the browser (lib/slideshowVideo.ts).
export type SlideshowVideo = {
  // Each photo from this site: a canvas won't take another site's photo (the CDN has no CORS).
  photoUrl: (photoId: string) => string;
  // The file is named after it (null: the page's title).
  title: string | null;
  // The photos as files, when this browser can't make a video.
  photosFallback?: () => void;
};

type VideoState =
  | { status: "working"; pct: number }
  | { status: "done"; file: File; url: string }
  | { status: "unsupported" }
  | { status: "failed" };

// A phone holds less in memory: the video is 720p there (slideshowVideoSize).
function isPhone(): boolean {
  if (typeof window === "undefined") return false;
  return navigator.maxTouchPoints > 0 && Math.min(window.screen.width, window.screen.height) < 820;
}

function saveFile(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function GallerySlideshow({
  photos,
  onClose,
  video,
  fx3d = false,
}: {
  photos: SlidePhoto[];
  onClose: () => void;
  // The download button (a video of the slideshow); none when downloads aren't allowed.
  video?: SlideshowVideo;
  // The 3D slideshow (owner, 2026-11-02, admin only for now: lib/slideshow3d/access.ts): the photos
  // in a random order, 3D transitions between them, drawn on a canvas by the same code as the video.
  // Off: the classic slideshow below, unchanged.
  fx3d?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const effects = useMemo(() => randomEffects(photos.length), [photos.length]);
  // One seed when the slideshow opens: the order, the effects and the drift, the same on the screen
  // and in the video made from it.
  const [showSeed] = useState(newShowSeed);
  const show = useMemo(() => (fx3d ? makeShowPlan(photos.length, showSeed) : null), [fx3d, photos.length, showSeed]);
  const shown = show ? show.order.map((i) => photos[i]) : photos;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<ShowPlayer | null>(null);
  const playingRef = useRef(playing);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const showUrls = show ? shown.map((p) => p.url).join("\n") : "";
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!show || !canvas || !showUrls) return;
    let player: ShowPlayer | null = null;
    let cancelled = false;
    void import("@/lib/slideshow3d/player").then(({ ShowPlayer }) => {
      if (cancelled) return;
      player = new ShowPlayer({ canvas, urls: showUrls.split("\n"), plan: show, onIndex: setIndex, playing: playingRef.current });
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
      player?.destroy();
      playerRef.current = null;
    };
  }, [show, showUrls]);
  useEffect(() => {
    playingRef.current = playing;
    playerRef.current?.setPlaying(playing);
  }, [playing]);
  const t = useT();
  const [videoState, setVideoState] = useState<VideoState | null>(null);
  const cancelVideo = useRef(false);
  const videoUrl = useRef<string | null>(null);
  // Closing stops a video still being made, and frees the finished one.
  useEffect(
    () => () => {
      cancelVideo.current = true;
      if (videoUrl.current) URL.revokeObjectURL(videoUrl.current);
    },
    []
  );
  const makeVideo = async () => {
    if (!video || videoState?.status === "working") return;
    setPlaying(false);
    cancelVideo.current = false;
    setVideoState({ status: "working", pct: 0 });
    try {
      const blob = await exportSlideshowVideo({
        urls: shown.map((p) => video.photoUrl(p.id)),
        effects,
        show,
        phone: isPhone(),
        onProgress: (f) => setVideoState((s) => (s?.status === "working" ? { status: "working", pct: Math.min(99, Math.round(f * 100)) } : s)),
        isCancelled: () => cancelVideo.current,
      });
      const file = new File([blob], slideshowFileName(video.title ?? document.title, t("מצגת"), blob.type === "video/webm" ? "webm" : "mp4"), { type: blob.type });
      if (videoUrl.current) URL.revokeObjectURL(videoUrl.current);
      const url = URL.createObjectURL(file);
      videoUrl.current = url;
      saveFile(url, file.name);
      setVideoState({ status: "done", file, url });
    } catch (e) {
      const reason = e instanceof SlideshowVideoError ? e.reason : "failed";
      setVideoState(reason === "cancelled" ? null : { status: reason });
    }
  };
  const canShareFile = videoState?.status === "done" && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [videoState.file] });
  const shareVideo = async () => {
    if (videoState?.status !== "done") return;
    try {
      await navigator.share({ files: [videoState.file] });
    } catch {
      // Closed the share sheet.
    }
  };
  // Arrows follow the page's own direction (the client's language), not <html dir>.
  const isRtl = dirOf(useLang()) === "rtl";

  const next = () => (show ? playerRef.current?.next() : setIndex((i) => (i + 1) % photos.length));
  const prev = () => (show ? playerRef.current?.prev() : setIndex((i) => (i - 1 + photos.length) % photos.length));

  useEffect(() => {
    // The 3D slideshow keeps its own time (lib/slideshow3d/player.ts).
    if (!playing || photos.length <= 1 || show) return;
    const t = setTimeout(next, SLIDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing, photos.length, show]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") (isRtl ? prev : next)();
      if (e.key === "ArrowLeft") (isRtl ? next : prev)();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, isRtl]);

  if (photos.length === 0) return null;
  const photo = photos[index];
  const effect = effects[index];

  return (
    <div
      className="fixed inset-0 z-[80] bg-black flex items-center justify-center overflow-hidden select-none"
      // A swipe on the 3D slideshow: the finger to the left brings the next photo, as in the gallery.
      onTouchStart={
        show
          ? (e) => {
              const t = e.touches[0];
              touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
            }
          : undefined
      }
      onTouchEnd={
        show
          ? (e) => {
              const start = touchStart.current;
              touchStart.current = null;
              const t = e.changedTouches[0];
              if (!start || !t) return;
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
              if (dx < 0) next();
              else prev();
            }
          : undefined
      }
    >
      {show ? (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      ) : (
        <>
          <style>{`
            @keyframes gs-kenburns-in { from { transform: scale(1); } to { transform: scale(1.32); } }
            @keyframes gs-kenburns-out { from { transform: scale(1.32); } to { transform: scale(1); } }
            @keyframes gs-fade-punch { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: scale(1); } }
            @keyframes gs-slide-left { from { transform: translateX(22%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes gs-slide-right { from { transform: translateX(-22%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes gs-slide-up { from { transform: translateY(18%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes gs-slide-down { from { transform: translateY(-18%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes gs-rotate-in { from { opacity: 0; transform: rotate(-9deg) scale(0.9); } to { opacity: 1; transform: rotate(0deg) scale(1); } }
            @keyframes gs-circle-reveal { from { clip-path: circle(0% at 50% 50%); } to { clip-path: circle(75% at 50% 50%); } }
          `}</style>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.id}
            src={photo.url}
            alt=""
            className="max-w-full max-h-full object-contain"
            style={{ animation: ANIMATIONS[effect] }}
          />
        </>
      )}

      <div className="absolute top-4 end-4 flex items-center gap-2">
        <button
          onClick={onClose}
          aria-label={t("סגירת מצגת")}
          className="h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg"
        >
          <IconClose className="h-5 w-5" />
        </button>
        {video && (
          <button
            onClick={makeVideo}
            disabled={videoState?.status === "working"}
            aria-label={t("הורדת המצגת כסרטון")}
            title={t("הורדת המצגת כסרטון")}
            className="h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-50"
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
              <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
            </svg>
          </button>
        )}
      </div>

      <button
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? t("השהיה") : t("המשך")}
        className="absolute top-4 start-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-sm font-semibold"
      >
        {playing ? "⏸" : "▶"}
      </button>

      {photos.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label={t("התמונה הקודמת")}
            className="absolute start-3 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center text-xl"
          >
            {isRtl ? "›" : "‹"}
          </button>
          <button
            onClick={next}
            aria-label={t("התמונה הבאה")}
            className="absolute end-3 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center text-xl"
          >
            {isRtl ? "‹" : "›"}
          </button>
        </>
      )}

      {video && videoState && (
        <div className="absolute bottom-12 inset-x-4 mx-auto max-w-sm rounded-2xl p-4 text-white text-sm" style={{ background: "rgba(20, 19, 17, 0.88)" }} role="status">
          {videoState.status === "working" && (
            <>
              <p className="font-semibold mb-2">{t("מכין את הסרטון של המצגת… {pct}%", { pct: videoState.pct })}</p>
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden mb-3">
                <div className="h-full bg-white" style={{ width: `${videoState.pct}%`, transition: "width 300ms" }} />
              </div>
              <p className="text-xs text-white/70 mb-3">{t("הסרטון נוצר במכשיר. כדאי להשאיר את החלון פתוח עד הסוף.")}</p>
              <button onClick={() => (cancelVideo.current = true)} className="w-full rounded-lg py-2 text-sm font-semibold bg-white/15">
                {t("ביטול")}
              </button>
            </>
          )}
          {videoState.status === "done" && (
            <>
              <p className="font-semibold mb-3">✓ {t("הסרטון מוכן")}</p>
              <div className="flex gap-2">
                <button onClick={() => saveFile(videoState.url, videoState.file.name)} className="flex-1 rounded-lg py-2 text-sm font-semibold bg-white text-black">
                  {t("הורדה")}
                </button>
                {canShareFile && (
                  <button onClick={shareVideo} className="flex-1 rounded-lg py-2 text-sm font-semibold bg-white/15">
                    {t("שיתוף")}
                  </button>
                )}
                <button onClick={() => setVideoState(null)} className="rounded-lg px-3 py-2 text-sm font-semibold bg-white/15">
                  {t("סגירה")}
                </button>
              </div>
            </>
          )}
          {videoState.status === "unsupported" && (
            <>
              <p className="font-semibold mb-1">{t("הדפדפן הזה לא יכול ליצור סרטון.")}</p>
              <p className="text-xs text-white/70 mb-3">{t("אפשר ליצור אותו בכרום או בספארי מעודכנים, במחשב או בטלפון.")}</p>
              <div className="flex gap-2">
                {video.photosFallback && (
                  <button
                    onClick={() => {
                      onClose();
                      video.photosFallback?.();
                    }}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold bg-white text-black"
                  >
                    {t("הורדת התמונות במקום")}
                  </button>
                )}
                <button onClick={() => setVideoState(null)} className="rounded-lg px-3 py-2 text-sm font-semibold bg-white/15">
                  {t("סגירה")}
                </button>
              </div>
            </>
          )}
          {videoState.status === "failed" && (
            <>
              <p className="font-semibold mb-3">{t("יצירת הסרטון נכשלה. אפשר לנסות שוב.")}</p>
              <div className="flex gap-2">
                <button onClick={makeVideo} className="flex-1 rounded-lg py-2 text-sm font-semibold bg-white text-black">
                  {t("ניסיון נוסף")}
                </button>
                <button onClick={() => setVideoState(null)} className="rounded-lg px-3 py-2 text-sm font-semibold bg-white/15">
                  {t("סגירה")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <span dir="ltr" className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-white/70 font-data">
        {index + 1} / {photos.length}
      </span>
    </div>
  );
}
