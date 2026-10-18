"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/paginatedFetch";
import { BTN_PRESS } from "@/lib/viewTransition";
import { IconClose } from "@/components/icons/AlbumIcons";
import CullingZoom from "@/components/CullingZoom";
import { useT } from "@/i18n/client";
import {
  FLAGS,
  LABEL_COLUMNS,
  NO_FLAGS,
  describe,
  fromRow,
  hasFlags,
  isDone,
  nextOpen,
  saveCullingLabel,
  type LabelFlags,
  type LabelRow,
  type PhotoLabel,
} from "@/lib/culling/labels";

// Photo culling labels, full screen (owner, 2026-10-16: "דרך הטלפון", "ישירות דרך הגלריה"). Opened
// from a gallery (admin only, next to "מיון תמונות") with the photos on screen, or from the labelling
// page with its mixed order. Built for a phone: the buttons sit under the thumb, a swipe moves
// between photos, a tap opens the original at 100% around the tapped point.
//
// A photo can have several problems: the problem buttons toggle, and the one big button commits.
// With nothing toggled it reads "תקינה", so a fine photo is still one tap. Keys: 1 fine, 2–5 the
// problems, Enter save, 0 skip, arrows, Z zoom.

type Photo = { id: string; storage_path: string; original_filename: string };

export default function CullingLabelModal({
  photos,
  galleryId,
  userId,
  onLabel,
  onClose,
}: {
  photos: Photo[];
  galleryId: string;
  userId: string;
  onLabel?: (photoId: string, label: PhotoLabel | null) => void;
  onClose: () => void;
}) {
  const t = useT();
  const supabase = useMemo(() => createClient(), []);
  const [labels, setLabels] = useState<Map<string, PhotoLabel> | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  // The problems toggled on the photo on screen, before saving; starts from its saved label.
  const [draft, setDraft] = useState<{ photoId: string | null; flags: LabelFlags }>({ photoId: null, flags: NO_FLAGS });
  const touch = useRef<{ x: number; y: number; swiped: boolean } | null>(null);
  const ids = useMemo(() => photos.map((p) => p.id), [photos]);

  // A horizontal swipe is ours: without this, Chrome reads a swipe to the right as "back" and leaves
  // the page (caught in testing).
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overscrollBehaviorX;
    html.style.overscrollBehaviorX = "none";
    return () => {
      html.style.overscrollBehaviorX = prev;
    };
  }, []);

  // Fresh labels on open; starts on the first photo still to label.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchAllRows<LabelRow>((from, to) =>
        supabase.from("culling_labels").select(LABEL_COLUMNS).eq("gallery_id", galleryId).order("photo_id").range(from, to).returns<LabelRow[]>()
      );
      if (cancelled) return;
      const map = new Map((rows ?? []).map((r) => [r.photo_id, fromRow(r)]));
      setLabels(map);
      const first = ids.findIndex((id) => !isDone(map.get(id)));
      setIndex(first === -1 ? 0 : first);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, galleryId, ids]);

  const photo = photos[index] ?? null;
  const saved = photo ? labels?.get(photo.id) : undefined;
  // A new photo on screen: the draft starts from what was saved for it.
  if (photo && labels && draft.photoId !== photo.id) {
    setDraft({ photoId: photo.id, flags: isDone(saved) && !saved!.skip ? saved!.flags : NO_FLAGS });
  }
  const flags = draft.photoId === photo?.id ? draft.flags : NO_FLAGS;

  const imageUrl = (p: Photo) => `/api/galleries/${galleryId}/photos/${p.id}/image?size=2000`;
  const go = useCallback((delta: number) => setIndex((i) => Math.max(0, Math.min(photos.length - 1, i + delta))), [photos.length]);

  // The next two load ahead, so moving on is instant.
  useEffect(() => {
    for (const p of photos.slice(index + 1, index + 3)) {
      const img = new Image();
      img.src = imageUrl(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos]);

  const commit = useCallback(
    async (value: PhotoLabel) => {
      if (!photo || !labels) return;
      const prev = labels.get(photo.id) ?? null;
      const next = new Map(labels).set(photo.id, value);
      setLabels(next);
      setIndex(nextOpen(ids, index, next));
      setError(false);
      onLabel?.(photo.id, value);
      const ok = await saveCullingLabel(supabase, { photoId: photo.id, userId, galleryId, label: value });
      if (!ok) {
        setError(true);
        onLabel?.(photo.id, prev);
        setLabels((cur) => {
          const back = new Map(cur);
          if (prev) back.set(photo.id, prev);
          else back.delete(photo.id);
          return back;
        });
      }
    },
    [photo, labels, ids, index, onLabel, supabase, userId, galleryId]
  );

  const toggle = useCallback(
    (key: keyof LabelFlags) => {
      if (!photo) return;
      setDraft((d) => ({ photoId: photo.id, flags: { ...(d.photoId === photo.id ? d.flags : NO_FLAGS), [key]: !(d.photoId === photo.id && d.flags[key]) } }));
    },
    [photo]
  );
  const saveDraft = useCallback(() => void commit({ skip: false, flags, v: 2, lookChecked: true }), [commit, flags]);
  const markFine = useCallback(() => void commit({ skip: false, flags: NO_FLAGS, v: 2, lookChecked: true }), [commit]);
  const skip = useCallback(() => void commit({ skip: true, flags: NO_FLAGS, v: 2, lookChecked: true }), [commit]);

  // Visual "forward" is left in a right-to-left page (the same as the gallery's own lightbox).
  useEffect(() => {
    const rtl = document.documentElement.dir !== "ltr";
    const onKey = (e: KeyboardEvent) => {
      if (zoom) return;
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      // Enter saves even when a problem button still has the focus from a click (its default would
      // toggle that problem off again).
      const f = FLAGS.find((x) => x.hotkey === e.key);
      if (f) {
        e.preventDefault();
        toggle(f.key);
      } else if (e.key === "1") {
        e.preventDefault();
        markFine();
      } else if (e.key === "Enter") {
        e.preventDefault();
        saveDraft();
      } else if (e.key === "0") skip();
      else if (e.key === "Escape") onClose();
      else if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) go(1);
      else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) go(-1);
      else if (e.key.toLowerCase() === "z") setZoom({ x: 0.5, y: 0.5 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, markFine, saveDraft, skip, go, onClose, zoom]);

  const done = useMemo(() => (labels ? ids.filter((id) => isDone(labels.get(id)) && !labels.get(id)!.skip).length : 0), [ids, labels]);
  const closeZoom = useCallback(() => setZoom(null), []);
  const anyFlag = hasFlags(flags);
  const flagCount = FLAGS.filter((f) => flags[f.key]).length;

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col select-none" role="dialog" aria-modal="true" aria-label={t("סימון למודל הסינון")}>
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2 text-white">
        <button onClick={onClose} className={`h-9 w-9 rounded-full bg-white/10 flex items-center justify-center ${BTN_PRESS}`} aria-label={t("סגירה")}>
          <IconClose className="h-4 w-4" />
        </button>
        <div className="text-center min-w-0">
          <div className="text-sm font-semibold font-data">{photos.length ? t("תמונה {n} מתוך {total}", { n: index + 1, total: photos.length }) : ""}</div>
          <div className="text-[11px] text-white/60 mt-0.5">{t("סומנו {n} מהתמונות כאן", { n: done })}</div>
        </div>
        <div className="h-9 w-9" />
      </div>

      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden px-2 touch-pan-y overscroll-none"
        onTouchStart={(e) => {
          const p = e.touches[0];
          touch.current = { x: p.clientX, y: p.clientY, swiped: false };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          const p = e.changedTouches[0];
          if (!start) return;
          const dx = p.clientX - start.x;
          const dy = p.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            start.swiped = true;
            // A finger moving left brings the next photo, as in the client's gallery (PublicGalleryView).
            go(dx < 0 ? 1 : -1);
          }
        }}
      >
        {!labels ? (
          <p className="text-sm text-white/70">{t("טוען...")}</p>
        ) : photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={photo.id}
              src={imageUrl(photo)}
              alt={photo.original_filename}
              draggable={false}
              onClick={(e) => {
                if (touch.current?.swiped) {
                  touch.current = null;
                  return;
                }
                const r = e.currentTarget.getBoundingClientRect();
                setZoom({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
              }}
              className="max-h-full max-w-full object-contain cursor-zoom-in"
            />
            {isDone(saved) && (
              <div className="absolute top-2 inset-x-0 flex justify-center px-3 pointer-events-none">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white text-ink text-center">{describe(saved!).map((x) => t(x)).join(" · ")}</span>
              </div>
            )}
          </>
        ) : null}
      </div>

      <div className="px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+12px)] space-y-2">
        {error && <p className="text-xs text-center text-rose">{t("שמירת הסימון נכשלה, נסו שוב.")}</p>}
        <div className="grid grid-cols-2 gap-2">
          {FLAGS.map((f) => (
            <button
              key={f.key}
              onClick={() => toggle(f.key)}
              disabled={!photo || !labels}
              aria-pressed={flags[f.key]}
              className={`h-12 rounded-2xl text-sm font-semibold disabled:opacity-50 ${flags[f.key] ? "bg-white text-ink" : "bg-white/15 text-white"} ${BTN_PRESS}`}
            >
              {flags[f.key] ? "✓ " : ""}
              {t(f.text)}
            </button>
          ))}
        </div>
        <button
          onClick={anyFlag ? saveDraft : markFine}
          disabled={!photo || !labels}
          className={`w-full h-14 rounded-2xl text-base font-bold text-white disabled:opacity-50 ${BTN_PRESS}`}
          style={{ background: anyFlag ? "var(--color-amber-deep)" : "var(--color-sage)" }}
        >
          {anyFlag ? t("שמירה ({n}) והבאה", { n: flagCount }) : `✓ ${t("תקינה")}`}
        </button>
        <div className="flex items-center justify-between text-xs text-white/70 pt-1">
          <button onClick={() => go(-1)} disabled={index === 0} className="px-2 py-1.5 disabled:opacity-30">
            {t("הקודמת")}
          </button>
          <button onClick={skip} disabled={!photo || !labels} className="px-3 py-1.5 underline disabled:opacity-30">
            {t("דילוג (לא בטוח)")}
          </button>
          <button onClick={() => go(1)} disabled={index >= photos.length - 1} className="px-2 py-1.5 disabled:opacity-30">
            {t("הבאה")}
          </button>
        </div>
        <p className="hidden sm:block text-center text-[11px] text-white/40">{t("מקשים: 1 תקינה, 2–5 בעיות, Enter שמירה, 0 דילוג, חיצים למעבר, Z להגדלה")}</p>
      </div>

      {zoom && photo && <CullingZoom storagePath={photo.storage_path} x={zoom.x} y={zoom.y} onClose={closeZoom} />}
    </div>
  );
}
