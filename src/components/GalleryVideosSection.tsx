"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BTN_PRESS } from "@/lib/viewTransition";

type GalleryVideoRow = {
  id: string;
  storage_path: string;
  original_filename: string;
  file_size_bytes: number;
};

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
export default function GalleryVideosSection({ galleryId, allowed = true, maxBytes }: { galleryId: string; allowed?: boolean; maxBytes: number }) {
  const maxMb = Math.round(maxBytes / (1024 * 1024));
  const upgradeHint = maxMb < 500 ? " (במסלול פרו+ אפשר להעלות עד 500MB)" : "";
  const supabase = createClient();
  const [videos, setVideos] = useState<GalleryVideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
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
        setVideos(data ?? []);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!allowed || !fileList || fileList.length === 0) return;
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const all = Array.from(fileList);
    const tooBig = all.filter((f) => f.size > maxBytes);
    if (tooBig.length > 0) {
      setError(`גודל וידאו מקסימלי במסלול שלך הוא ${maxMb}MB לקובץ${upgradeHint}. הקבצים הבאים לא הועלו: ${tooBig.map((f) => `${f.name} (${formatSize(f.size)})`).join(", ")}`);
    }
    for (const file of all.filter((f) => f.size <= maxBytes)) {
      setUploading(file.name);
      try {
        const path = `${user.id}/${galleryId}/video-${crypto.randomUUID()}-${file.name}`;
        const urlRes = await fetch("/api/storage/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket: "galleries", path, contentType: file.type || "video/mp4" }),
        });
        const urlData = await urlRes.json();
        if (!urlRes.ok || !urlData.url) throw new Error(urlData.error ?? "העלאת הווידאו נכשלה");

        const putRes = await fetch(urlData.url, { method: "PUT", headers: { "Content-Type": file.type || "video/mp4" }, body: file });
        if (!putRes.ok) throw new Error("העלאת הווידאו נכשלה");

        const { data: video, error: insertError } = await supabase
          .from("gallery_videos")
          .insert({
            gallery_id: galleryId,
            photographer_id: user.id,
            storage_path: path,
            original_filename: file.name,
            file_size_bytes: file.size,
            sort_order: videos.length,
          })
          .select("id, storage_path, original_filename, file_size_bytes")
          .single<GalleryVideoRow>();
        if (insertError || !video) {
          // The DB trigger (enforce_gallery_video_by_plan) is the real gate — the upload already
          // reached storage by now, so drop that orphaned object before reporting why it was refused.
          await fetch("/api/storage/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket: "galleries", paths: [path] }),
          }).catch(() => {});
          const msg = insertError?.message ?? "";
          if (msg.includes("video_not_allowed_for_plan")) throw new Error("וידאו בגלריה זמין רק במסלולי פרו ופרו+");
          if (msg.includes("video_too_large_for_plan")) throw new Error(`הווידאו גדול מהמותר במסלול שלך (עד ${maxMb}MB לקובץ)`);
          throw new Error(msg || "שגיאה בשמירת הווידאו");
        }
        setVideos((prev) => [...prev, video]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בהעלאת הווידאו");
      }
    }
    setUploading(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      setError("שגיאה בטעינת הווידאו");
      return;
    }
    setPlayingId(video.id);
    setPlayUrl(data.url);
  };

  if (loading) return null;

  return (
    <div className="mt-5">
      <div className="text-sm font-semibold mb-2">וידאו</div>

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
                    ▶ נגינה
                  </button>
                  <button onClick={() => deleteVideo(video)} className={`text-xs font-semibold text-rose ${BTN_PRESS}`}>
                    מחיקה
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
            {uploading ? `מעלה: ${uploading}...` : `+ העלאת וידאו (MP4, MOV, WebM, עד ${maxMb}MB לקובץ)`}
          </label>
        </>
      ) : (
        // Not a retroactive lock — any video already on this gallery (uploaded before a downgrade,
        // or grandfathered) still plays above; this only blocks ADDING new ones on the entry tier.
        <p className="w-full text-center rounded-lg py-2.5 text-xs font-semibold bg-chip text-ink-soft">
          וידאו בגלריה זמין במסלולי פרו (עד 300MB לקובץ) ופרו+ (עד 500MB לקובץ), שדרגו מסלול בהגדרות
        </p>
      )}
      {error && <p className="text-xs text-rose mt-2">{error}</p>}
    </div>
  );
}
