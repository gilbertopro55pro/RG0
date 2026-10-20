"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
  type GalleryVideoUploadRow,
} from "@/lib/galleryUploads";
import { readDataTransferItems, type DroppedFile } from "@/lib/fileDrop";
import { droppedFromFileList, getOrCreatePortfolioGallery, portfolioVideos } from "@/lib/portfolioUploads";
import { sortSubTabs, subTabLabel } from "@/lib/portfolioNames";
import { PORTFOLIO_VIDEO_MAX_BYTES } from "@/lib/stages";
import { useT } from "@/i18n/client";
import { captureVideoPoster } from "@/lib/videoPoster";

// Videos straight to the public portfolio (owner, 2026-10-16), under "העלאת תמונות ישירות
// לפורטפוליו". פרו and פרו+ (this screen's portfolio section is closed to the entry tier), up to
// 400MB a file (PORTFOLIO_VIDEO_MAX_BYTES, enforced again by migration 0176). Like the photos, a
// dragged folder opens a tab named after it, and a folder inside it a sub-tab
// (lib/portfolioUploads.ts). The videos live in the hidden portfolio gallery (gallery_videos with
// in_portfolio) and upload in the background engine, like a gallery's videos.

type Video = GalleryVideoUploadRow & { portfolio_category: string | null; portfolio_subcategory: string | null; poster_path?: string | null };

const MAX_MB = Math.round(PORTFOLIO_VIDEO_MAX_BYTES / (1024 * 1024));
const NO_TAB = "";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const nameOf = (filename: string) => filename.replace(/\.[^.]+$/, "");

export default function PortfolioVideoUploadPanel({ photographerId }: { photographerId: string }) {
  const supabase = createClient();
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [galleryId, setGalleryId] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The tabs (and their sub-tabs) the last drop opens, with how many videos go to each.
  const [created, setCreated] = useState<{ tab: string; count: number; subs: { name: string; count: number }[] }[] | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // The portfolio gallery, if there is one yet (created on the first upload), and its videos.
  useEffect(() => {
    (async () => {
      const { data: gallery } = await supabase
        .from("galleries")
        .select("id")
        .eq("photographer_id", photographerId)
        .eq("is_portfolio_only", true)
        .maybeSingle<{ id: string }>();
      if (!gallery) return;
      setGalleryId(gallery.id);
      const { data } = await supabase
        .from("gallery_videos")
        .select("id, storage_path, original_filename, file_size_bytes, portfolio_category, portfolio_subcategory, poster_path")
        .eq("gallery_id", gallery.id)
        .eq("in_portfolio", true)
        .order("created_at", { ascending: true })
        .returns<Video[]>();
      // Keeps a video the running upload saved while this was loading.
      const loaded = data ?? [];
      setVideos((prev) => [...loaded, ...prev.filter((v) => !loaded.some((l) => l.id === v.id))]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photographerId]);

  // Each video's still frame, the cover on the preview card of a link to its tab (app/p/[slug]/og):
  // made here in the background for any video without one yet, a new upload included. One try per
  // video per visit; one that fails (a codec this browser doesn't play) is tried again next time.
  const posterTriedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!galleryId) return;
    const todo = videos.filter((v) => !v.poster_path && !posterTriedRef.current.has(v.id));
    if (todo.length === 0) return;
    for (const v of todo) posterTriedRef.current.add(v.id);
    void (async () => {
      for (const v of todo) {
        const res = await fetch(`/api/galleries/${galleryId}/videos/${v.id}/url`).catch(() => null);
        const url: string | null = res?.ok ? ((await res.json()) as { url?: string }).url ?? null : null;
        const blob = url ? await captureVideoPoster(url) : null;
        if (!blob) continue;
        const saved = await fetch(`/api/galleries/${galleryId}/videos/${v.id}/poster`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob }).catch(() => null);
        const posterPath = saved?.ok ? ((await saved.json()) as { posterPath?: string }).posterPath : undefined;
        if (posterPath) setVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, poster_path: posterPath } : x)));
      }
    })();
  }, [galleryId, videos]);

  const key = galleryId ? uploadKey("videos", galleryId) : "";
  const job = useUpload(key);
  const active = isUploadActive(job);

  // Saved videos appear as they land; listening also makes the upload count as watched while this
  // screen is open (no email or phone notification when it ends here).
  useEffect(() => {
    if (!key) return;
    return onUploadItem(key, (value) => {
      const video = value as Video;
      setVideos((prev) => (prev.some((v) => v.id === video.id) ? prev : [...prev, video]));
    });
  }, [key]);

  // When the upload ends: how many made it and which didn't, then it leaves the uploads list.
  const seenPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (!key) return;
    // The engine words each failure as "<file> (<reason>)", the reason being a dictionary key.
    const failedLabel = (s: string) => s.replace(/ \(([^()]*)\)$/, (_, reason: string) => ` (${t(reason)})`);
    const handle = () => {
      const u = getUpload(key);
      if (!u) {
        seenPhaseRef.current = null;
        return;
      }
      const prev = seenPhaseRef.current;
      seenPhaseRef.current = u.phase;
      if (isUploadActive(u) || prev === u.phase) return;
      const message =
        u.phase === "offline"
          ? t("ההעלאה נעצרה, אין חיבור לאינטרנט")
          : u.failed.length > 0
            ? `${t("העלאת הווידאו נכשלה")}: ${u.failed.map(failedLabel).join(", ")}`
            : null;
      if (u.phase === "done") setAddedCount(u.succeeded);
      if (message) setError((prevError) => (prevError ? `${prevError}\n${message}` : message));
      dismissUpload(key);
    };
    const first = setTimeout(handle, 0);
    const unsubscribe = subscribeUploads(handle);
    return () => {
      clearTimeout(first);
      unsubscribe();
    };
  }, [key, t]);

  // A file dropped just outside the frame would make the browser open it (leaving the page, and
  // the upload with it): on this screen a stray file drop does nothing.
  useEffect(() => {
    const guard = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);

  const send = async (dropped: DroppedFile[]) => {
    if (dropped.length === 0) return;
    const { videos: entries, rejected, tooBig } = portfolioVideos(dropped, PORTFOLIO_VIDEO_MAX_BYTES);
    setAddedCount(0);
    const notes: string[] = [];
    if (tooBig.length > 0) {
      notes.push(
        t("גודל וידאו מקסימלי במסלול שלך הוא {mb}MB לקובץ{hint}. הקבצים הבאים לא הועלו: {files}", {
          mb: MAX_MB,
          hint: "",
          files: tooBig.map((f) => `${f.name} (${formatSize(f.size)})`).join(", "),
        })
      );
    }
    if (rejected > 0) notes.push(t("{n} קבצים לא בפורמט נתמך", { n: rejected }));
    if (entries.length === 0) {
      setError(notes.length > 0 ? notes.join("\n") : t("לא נבחרו קבצי וידאו"));
      return;
    }
    // One tab uploads at a time (two would only split the connection between them).
    if (otherTabUpload()) {
      setError(t("כבר מתבצעת העלאה בחלון אחר. אפשר להעלות כאן כשהיא תסתיים."));
      return;
    }
    const gallery = await getOrCreatePortfolioGallery(photographerId);
    if ("error" in gallery) {
      setError(t(gallery.error, { message: gallery.message ?? "" }));
      return;
    }
    setError(notes.length > 0 ? notes.join("\n") : null);
    setGalleryId(gallery.id);
    const where = new Map(entries.map((e) => [e.file, e]));
    enqueueVideoUpload({
      galleryId: gallery.id,
      galleryTitle: "פורטפוליו",
      userId: photographerId,
      sortBase: videos.length,
      files: entries.map((e) => e.file),
      href: "/settings?tab=portfolio",
      row: (file) => {
        const e = where.get(file);
        return { in_portfolio: true, portfolio_category: e?.tab ?? null, portfolio_subcategory: e?.tab ? (e.sub ?? null) : null };
      },
    });

    const tabs = new Map<string, { count: number; subs: Map<string, number> }>();
    for (const e of entries) {
      if (!e.tab) continue;
      const tab = tabs.get(e.tab) ?? { count: 0, subs: new Map<string, number>() };
      tab.count++;
      if (e.sub) tab.subs.set(e.sub, (tab.subs.get(e.sub) ?? 0) + 1);
      tabs.set(e.tab, tab);
    }
    setCreated(
      tabs.size > 0
        ? [...tabs.entries()].map(([tab, v]) => ({
            tab,
            count: v.count,
            subs: sortSubTabs([...v.subs.entries()].map(([name, count]) => ({ name, count })), (s) => s.name),
          }))
        : null
    );
  };

  const play = async (video: Video) => {
    if (playing?.id === video.id) {
      setPlaying(null);
      return;
    }
    const res = await fetch(`/api/galleries/${galleryId}/videos/${video.id}/url`);
    const data = res.ok ? await res.json() : null;
    if (!data?.url) {
      setError(t("שגיאה בטעינת הווידאו"));
      return;
    }
    setPlaying({ id: video.id, url: data.url });
  };

  const deleteVideo = async (video: Video) => {
    setConfirmId(null);
    if (playing?.id === video.id) setPlaying(null);
    const { error: deleteError } = await supabase.from("gallery_videos").delete().eq("id", video.id);
    if (deleteError) {
      setError(t("שגיאה בשמירה. נסו שוב"));
      return;
    }
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
    // Best effort, like a gallery's video: the row decides what's shown.
    await fetch("/api/storage/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "galleries", paths: [video.storage_path], previewPaths: video.poster_path ? [video.poster_path] : [] }),
    }).catch(() => {});
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const accept = "video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm";

  // The videos by tab, then sub-tab (numbered sub-tabs by their number), "כללי" last.
  const groups = (() => {
    const byTab = new Map<string, Map<string, Video[]>>();
    for (const v of videos) {
      const tab = v.portfolio_category ?? NO_TAB;
      const subs = byTab.get(tab) ?? new Map<string, Video[]>();
      const sub = v.portfolio_subcategory ?? "";
      subs.set(sub, [...(subs.get(sub) ?? []), v]);
      byTab.set(tab, subs);
    }
    return [...byTab.entries()]
      .sort((a, b) => (a[0] === NO_TAB ? 1 : b[0] === NO_TAB ? -1 : a[0].localeCompare(b[0], "he")))
      .map(([tab, subs]) => ({
        tab,
        subs: [...(subs.has("") ? [{ name: "", items: subs.get("")! }] : []), ...sortSubTabs([...subs.entries()].filter(([n]) => n).map(([name, items]) => ({ name, items })), (s) => s.name)],
      }));
  })();

  return (
    <div className="mt-3.5 pt-3.5 border-t border-line">
      <p className="text-sm font-semibold mb-1">{t("העלאת סרטונים לפורטפוליו")}</p>
      <p className="text-xs text-ink-soft mb-3.5">{t("גוררים סרטונים או תיקייה. כל תיקייה תהפוך ללשונית בשם שלה, ותיקיות שבתוכה לתת-לשוניות. עד {mb}MB לקובץ.", { mb: MAX_MB })}</p>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void send(droppedFromFileList(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void send(droppedFromFileList(e.target.files));
          e.target.value = "";
        }}
        {...({ webkitdirectory: "true", directory: "true" } as unknown as Record<string, string>)}
      />
      {/* Stays usable while uploading: more videos join the running upload. On a phone it's a tap-to-pick area. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (!hasFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          // Read synchronously: the drop's items are gone once this handler returns.
          void readDataTransferItems(e.dataTransfer.items).then(send);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${
          dragging ? "border-amber-deep bg-amber-bg" : "border-line bg-white"
        }`}
      >
        <span className="text-base font-bold">{dragging ? t("שחררו כאן, והסרטונים ייכנסו לפורטפוליו") : t("גררו לכאן סרטונים או תיקייה")}</span>
        <span className="text-xs text-ink-soft leading-relaxed max-w-md">
          <b className="text-ink">{t("תיקייה תהפוך ללשונית בשם שלה, ותיקייה בתוכה לתת-לשונית.")}</b>
          <br />
          {t("סרטונים בודדים (לא בתוך תיקייה) ייכנסו ל\"כללי\".")}
        </span>
        <span className="flex flex-wrap justify-center gap-2 mt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              folderInputRef.current?.click();
            }}
            className="rounded-lg px-3.5 py-2 text-xs font-bold bg-ink text-paper"
          >
            {t("בחירת תיקייה")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="rounded-lg px-3.5 py-2 text-xs font-bold bg-chip text-ink border border-line"
          >
            {t("בחירת סרטונים")}
          </button>
        </span>
      </div>

      {error && <p className="text-xs text-rose mt-2 whitespace-pre-line">{error}</p>}
      {job && active && (
        <div className="mt-3" aria-live="polite">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-line border-t-ink animate-spin" aria-hidden="true" />
            <span className="truncate">{t("מעלה {done} מתוך {total}", { done: job.done, total: job.total })}</span>
            <span className="ms-auto shrink-0 font-data text-ink-soft">{Math.round(job.pct)}%</span>
            <button onClick={() => cancelUpload(job.key)} className="shrink-0 text-rose underline">
              {t("ביטול")}
            </button>
          </div>
          <div className="mt-1 h-1 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${job.pct}%` }} />
          </div>
          <p className="text-[11px] text-ink-soft mt-1.5">{t("אפשר להמשיך לעבוד במערכת בזמן ההעלאה, ונעדכן כשהיא תסתיים.")}</p>
        </div>
      )}
      {!active && addedCount > 0 && <p className="text-xs text-sage mt-2">{t("{n} סרטונים נוספו לפורטפוליו", { n: addedCount })}</p>}
      {created && (active || addedCount > 0) && (
        <div className="mt-2 rounded-lg bg-chip px-3 py-2.5">
          <p className="text-xs font-semibold mb-1.5">{active ? t("נפתחות לשוניות בפורטפוליו:") : t("נפתחו לשוניות בפורטפוליו:")}</p>
          <div className="flex flex-col gap-1.5">
            {created.map((c) => (
              <div key={c.tab} className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-ink text-paper px-2.5 py-0.5 text-xs font-semibold">
                  {c.tab} <span className="font-data opacity-70">({c.count})</span>
                </span>
                {c.subs.map((sub) => (
                  <span key={sub.name} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-semibold">
                    {subTabLabel(sub.name)} <span className="font-data text-ink-soft">({sub.count})</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold mb-2">{t("הסרטונים בפורטפוליו ({n})", { n: videos.length })}</p>
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <div key={g.tab || "__none__"} className="rounded-xl border border-line bg-white px-3 py-2.5">
                <p className="text-xs font-bold mb-1.5">{g.tab || t("כללי (ללא נושא)")}</p>
                {g.subs.map((s) => (
                  <div key={s.name || "__tab__"} className={s.name ? "mt-2 ps-3 border-s-2 border-line" : ""}>
                    {s.name && <p className="text-[11px] font-semibold text-ink-soft mb-1">{subTabLabel(s.name)}</p>}
                    <ul className="flex flex-col gap-1">
                      {s.items.map((v) => (
                        <li key={v.id}>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate" title={v.original_filename}>
                              {nameOf(v.original_filename)}
                            </span>
                            <span className="shrink-0 font-data text-ink-soft">{formatSize(v.file_size_bytes)}</span>
                            {confirmId === v.id ? (
                              <>
                                <button onClick={() => deleteVideo(v)} className="shrink-0 font-semibold text-rose">
                                  {t("כן, מחיקה")}
                                </button>
                                <button onClick={() => setConfirmId(null)} className="shrink-0 text-ink-soft underline">
                                  {t("ביטול")}
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => play(v)} className="shrink-0 font-semibold text-ink-soft underline">
                                  {t("נגינה")}
                                </button>
                                <button onClick={() => setConfirmId(v.id)} className="shrink-0 font-semibold text-rose">
                                  {t("מחיקה")}
                                </button>
                              </>
                            )}
                          </div>
                          {playing?.id === v.id && (
                            <video src={playing.url} controls autoPlay playsInline className="w-full mt-2 rounded-lg max-h-72 bg-black" />
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
