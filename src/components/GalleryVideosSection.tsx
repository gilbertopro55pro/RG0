"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BTN_PRESS } from "@/lib/viewTransition";
import {
  cancelUpload,
  dismissUpload,
  enqueueVideoUpload,
  getUpload,
  isUploadActive,
  onUploadItem,
  otherTabUpload,
  subscribeUploads,
  uploadKey,
  useUpload,
  type GalleryVideoUploadRow as GalleryVideoRow,
} from "@/lib/galleryUploads";
import { useT } from "@/i18n/client";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// v1 "video delivery", not full adaptive streaming — see migration 0082's comment for why. The
// finished file is stored as-is in the same R2 bucket as photos and played back with a plain
// <video> tag; R2's signed GET URLs already support HTTP range requests, so seeking works.
// maxBytes is the per-file cap for the photographer's tier (VIDEO_MAX_BYTES_BY_TIER) — checked in the
// browser before anything is sent, so an oversized file never even starts uploading; the DB trigger
// enforce_gallery_video_by_plan is the backstop behind it.
// The upload runs in the shared upload engine (lib/galleryUploads.ts, owner 2026-10-10), with
// byte progress, and keeps going while the photographer moves around the app.
export default function GalleryVideosSection({
  galleryId,
  galleryTitle,
  allowed = true,
  maxBytes,
}: {
  galleryId: string;
  galleryTitle: string;
  allowed?: boolean;
  maxBytes: number;
}) {
  const t = useT();
  const maxMb = Math.round(maxBytes / (1024 * 1024));
  const upgradeHint = maxMb < 500 ? ` ${t("(במסלול פרו+ אפשר להעלות עד 500MB)")}` : "";
  const supabase = createClient();
  const [videos, setVideos] = useState<GalleryVideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("gallery_videos")
      .select("id, storage_path, original_filename, file_size_bytes")
      .eq("gallery_id", galleryId)
      .order("sort_order", { ascending: true })
      .returns<GalleryVideoRow[]>()
      .then(({ data }) => {
        // Keeps a video the running upload saved while this was loading.
        const loaded = data ?? [];
        setVideos((prev) => [...loaded, ...prev.filter((v) => !loaded.some((l) => l.id === v.id))]);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]);

  // This gallery's video upload, also one that kept going after leaving the page and coming back.
  const videoUploadKey = uploadKey("videos", galleryId);
  const upload = useUpload(videoUploadKey);
  const uploadActive = isUploadActive(upload);

  // Saved videos appear as they land. Listening also makes the upload count as watched while this
  // page is open (no email or phone notification when it ends here).
  useEffect(
    () =>
      onUploadItem(videoUploadKey, (value) => {
        const video = value as GalleryVideoRow;
        setVideos((prev) => (prev.some((v) => v.id === video.id) ? prev : [...prev, video]));
      }),
    [videoUploadKey]
  );

  // When the upload ends: the videos that didn't make it, then it leaves the uploads list.
  const seenUploadPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    // The engine words each failure as "<file> (<reason>)" with its reason in Hebrew; the reason
    // is one of the dictionary keys (galleries area), so it's shown in the photographer's language.
    const failedLabel = (s: string) => s.replace(/ \(([^()]*)\)$/, (_, reason: string) => ` (${t(reason)})`);
    const handle = () => {
      const u = getUpload(videoUploadKey);
      if (!u) {
        seenUploadPhaseRef.current = null;
        return;
      }
      const prev = seenUploadPhaseRef.current;
      seenUploadPhaseRef.current = u.phase;
      if (isUploadActive(u) || prev === u.phase) return;
      const message =
        u.phase === "offline"
          ? t("ההעלאה נעצרה, אין חיבור לאינטרנט")
          : u.failed.length > 0
            ? `${t("העלאת הווידאו נכשלה")}: ${u.failed.map(failedLabel).join(", ")}`
            : null;
      // Added to what's shown already (e.g. the files too big for the plan, from when they were picked).
      if (message) setError((prevError) => (prevError ? `${prevError}\n${message}` : message));
      dismissUpload(videoUploadKey);
    };
    // Also an upload that ended while this page was closed (checked once, right after opening).
    const first = setTimeout(handle, 0);
    const unsubscribe = subscribeUploads(handle);
    return () => {
      clearTimeout(first);
      unsubscribe();
    };
  }, [videoUploadKey, t]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!allowed || !fileList || fileList.length === 0) return;
    const all = Array.from(fileList);
    // Cleared so the same file can be picked again.
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
    // One tab uploads at a time (two would only split the connection between them).
    if (otherTabUpload()) {
      setError(t("כבר מתבצעת העלאה בחלון אחר. אפשר להעלות כאן כשהיא תסתיים."));
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const tooBig = all.filter((f) => f.size > maxBytes);
    if (tooBig.length > 0) {
      setError(
        t("גודל וידאו מקסימלי במסלול שלך הוא {mb}MB לקובץ{hint}. הקבצים הבאים לא הועלו: {files}", {
          mb: maxMb,
          hint: upgradeHint,
          files: tooBig.map((f) => `${f.name} (${formatSize(f.size)})`).join(", "),
        }),
      );
    }
    // While an upload runs, these join it (it keeps its own sort order going).
    enqueueVideoUpload({ galleryId, galleryTitle, userId: user.id, sortBase: videos.length, files: all.filter((f) => f.size <= maxBytes) });
  };

  const deleteVideo = async (video: GalleryVideoRow) => {
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
    await supabase.from("gallery_videos").delete().eq("id", video.id);
    // Best-effort storage cleanup, same as the photo-delete flow — the DB row is the source of
    // truth for what's actually shown, an orphaned R2 object costs pennies.
    await fetch("/api/storage/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "galleries", paths: [video.storage_path] }),
    }).catch(() => {});
  };

  const play = async (video: GalleryVideoRow) => {
    setError(null);
    const res = await fetch(`/api/galleries/${galleryId}/videos/${video.id}/url`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      setError(t("שגיאה בטעינת הווידאו"));
      return;
    }
    setPlayingId(video.id);
    setPlayUrl(data.url);
  };

  if (loading) return null;

  return (
    <div className="mt-5">
      <div className="text-sm font-semibold mb-2">{t("וידאו")}</div>

      {videos.length > 0 && (
        <div className="space-y-2 mb-3">
          {videos.map((video) => (
            <div key={video.id} className="rounded-xl p-3 bg-chip">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{video.original_filename}</div>
                  <div className="text-[11px] text-ink-soft">{formatSize(video.file_size_bytes)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => play(video)} className={`text-xs font-semibold text-ink-soft underline ${BTN_PRESS}`}>
                    ▶ {t("נגינה")}
                  </button>
                  <button onClick={() => deleteVideo(video)} className={`text-xs font-semibold text-rose ${BTN_PRESS}`}>
                    {t("מחיקה")}
                  </button>
                </div>
              </div>
              {playingId === video.id && playUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={playUrl} controls className="w-full mt-3 rounded-lg max-h-80" />
              )}
            </div>
          ))}
        </div>
      )}

      {allowed ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            id={`gallery-video-upload-${galleryId}`}
          />
          <label
            htmlFor={`gallery-video-upload-${galleryId}`}
            className={`w-full flex items-center justify-center rounded-lg py-2.5 text-xs font-semibold bg-white border border-line text-ink-soft cursor-pointer ${BTN_PRESS}`}
          >
            {`+ ${t("העלאת וידאו (MP4, MOV, WebM, עד {mb}MB לקובץ)", { mb: maxMb })}`}
          </label>
        </>
      ) : (
        // Not a retroactive lock — any video already on this gallery (uploaded before a downgrade,
        // or grandfathered) still plays above; this only blocks ADDING new ones on the entry tier.
        <p className="w-full text-center rounded-lg py-2.5 text-xs font-semibold bg-chip text-ink-soft">
          {t("וידאו בגלריה זמין במסלולי פרו (עד 300MB לקובץ) ופרו+ (עד 500MB לקובץ), שדרגו מסלול בהגדרות")}
        </p>
      )}
      {upload && uploadActive && (
        <div className="mt-2" aria-live="polite">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-line border-t-ink animate-spin" aria-hidden="true" />
            {/* Up to two videos go at once; this counts the one being worked on. */}
            <span className="truncate">{t("מעלה וידאו {n} מתוך {total}", { n: Math.min(upload.done + 1, upload.total), total: upload.total })}</span>
            <span className="ms-auto shrink-0 font-data text-ink-soft">{Math.round(upload.pct)}%</span>
            <button onClick={() => cancelUpload(videoUploadKey)} className={`shrink-0 text-rose underline ${BTN_PRESS}`}>
              {t("ביטול")}
            </button>
          </div>
          <div className="mt-1 h-1 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${upload.pct}%` }} />
          </div>
          <p className="text-[11px] text-ink-soft mt-1.5">{t("אפשר להמשיך לעבוד במערכת בזמן ההעלאה, ונעדכן כשהיא תסתיים.")}</p>
        </div>
      )}
      {error && <p className="text-xs text-rose mt-2 whitespace-pre-line">{error}</p>}
    </div>
  );
}
