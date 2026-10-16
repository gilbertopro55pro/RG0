"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/paginatedFetch";
import BodyPortal from "@/components/BodyPortal";
import { useT } from "@/i18n/client";

// Photo culling, round 0 (owner, 2026-10-16; app/admin/culling): labelling a test gallery by hand.
// One photo at a time, one tap (or key) per photo: fine / out of focus / eyes closed / both / skip,
// then on to the next unlabelled one. The order mixes the events (folders) evenly, so the first
// ~300 labels cover all of them. Judging focus needs full resolution: tapping the photo opens the
// original at 100% around the tapped point. Labels go to culling_labels (migration 0178).

type Label = "ok" | "blurry" | "eyes_closed" | "both" | "skip";
type Photo = { id: string; folder_id: string | null; original_filename: string; storage_path: string };
type Folder = { id: string; name: string; sort_order: number };

const TARGET = 300;
const LABELS: { key: Label; text: string; hotkey: string; className: string }[] = [
  { key: "ok", text: "תקינה", hotkey: "1", className: "bg-sage text-white" },
  { key: "blurry", text: "לא בפוקוס", hotkey: "2", className: "bg-ink text-white" },
  { key: "eyes_closed", text: "עיניים עצומות", hotkey: "3", className: "bg-ink text-white" },
  { key: "both", text: "גם וגם", hotkey: "4", className: "bg-ink text-white" },
  { key: "skip", text: "דילוג", hotkey: "0", className: "bg-white border border-line text-ink-soft" },
];

// A stable pseudo-random order (FNV-1a of the id), the same on every visit.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Each event shuffled, then the events taken in turns, so any prefix covers them all evenly.
function mixedOrder(photos: Photo[]): Photo[] {
  const byFolder = new Map<string, Photo[]>();
  for (const p of photos) {
    const k = p.folder_id ?? "";
    byFolder.set(k, [...(byFolder.get(k) ?? []), p]);
  }
  const lists = [...byFolder.values()].map((l) => l.sort((a, b) => hash(a.id) - hash(b.id)));
  const out: Photo[] = [];
  for (let i = 0; out.length < photos.length; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

export default function CullingLabeler({
  userId,
  galleries,
  initialGalleryId,
}: {
  userId: string;
  galleries: { id: string; title: string }[];
  initialGalleryId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const t = useT();
  const [galleryId, setGalleryId] = useState(initialGalleryId);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [labels, setLabels] = useState<Map<string, Label>>(new Map());
  const [folderFilter, setFolderFilter] = useState("");
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ url: string | null; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!galleryId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [foldersRes, photoRows, labelRows] = await Promise.all([
        supabase.from("gallery_folders").select("id, name, sort_order").eq("gallery_id", galleryId).order("sort_order").returns<Folder[]>(),
        fetchAllRows<Photo>((from, to) =>
          supabase.from("gallery_photos").select("id, folder_id, original_filename, storage_path").eq("gallery_id", galleryId).order("id").range(from, to).returns<Photo[]>()
        ),
        fetchAllRows<{ photo_id: string; label: Label }>((from, to) =>
          supabase.from("culling_labels").select("photo_id, label").eq("gallery_id", galleryId).order("photo_id").range(from, to).returns<{ photo_id: string; label: Label }[]>()
        ),
      ]);
      if (cancelled) return;
      setFolders(foldersRes.data ?? []);
      setPhotos(photoRows ?? []);
      setLabels(new Map((labelRows ?? []).map((r) => [r.photo_id, r.label])));
      setFolderFilter("");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [galleryId, supabase]);

  const order = useMemo(() => mixedOrder(folderFilter ? photos.filter((p) => p.folder_id === folderFilter) : photos), [photos, folderFilter]);

  // Opens on the first photo not labelled yet (also after switching gallery or event). Only when
  // the list itself changes, not on every label.
  const [orderShown, setOrderShown] = useState(order);
  if (orderShown !== order) {
    setOrderShown(order);
    const first = order.findIndex((p) => !labels.has(p.id));
    setIndex(first === -1 ? 0 : first);
  }

  const photo = order[index] ?? null;
  const imageUrl = (p: Photo) => `/api/galleries/${galleryId}/photos/${p.id}/image?size=2000`;

  // The next two load ahead, so moving on is instant.
  useEffect(() => {
    for (const p of order.slice(index + 1, index + 3)) {
      const img = new Image();
      img.src = imageUrl(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, order]);

  const nextUnlabelled = useCallback(
    (from: number, map: Map<string, Label>) => {
      for (let i = from + 1; i < order.length; i++) if (!map.has(order[i].id)) return i;
      return Math.min(from + 1, order.length - 1);
    },
    [order]
  );

  const label = useCallback(
    async (value: Label) => {
      if (!photo || !galleryId) return;
      const prev = labels.get(photo.id);
      const next = new Map(labels).set(photo.id, value);
      setLabels(next);
      setIndex(nextUnlabelled(index, next));
      const { error: saveError } = await supabase
        .from("culling_labels")
        .upsert({ photo_id: photo.id, photographer_id: userId, gallery_id: galleryId, label: value, updated_at: new Date().toISOString() }, { onConflict: "photo_id" });
      if (saveError) {
        setError(t("שמירת הסימון נכשלה, נסו שוב."));
        setLabels((cur) => {
          const back = new Map(cur);
          if (prev) back.set(photo.id, prev);
          else back.delete(photo.id);
          return back;
        });
      }
    },
    [photo, galleryId, labels, index, nextUnlabelled, supabase, userId, t]
  );

  const openZoom = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!photo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setZoom({ url: null, x, y });
    const res = await fetch("/api/storage/download-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "galleries", path: photo.storage_path }),
    }).catch(() => null);
    const data = res?.ok ? await res.json() : null;
    if (data?.url) setZoom({ url: data.url, x, y });
    else setZoom(null);
  };

  // 1–4 and 0 label, the arrows move (left is next, the page reads right to left), Z zooms, Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (zoom) {
        if (e.key === "Escape" || e.key.toLowerCase() === "z") setZoom(null);
        return;
      }
      const l = LABELS.find((x) => x.hotkey === e.key);
      if (l) {
        e.preventDefault();
        void label(l.key);
      } else if (e.key === "ArrowLeft") setIndex((i) => Math.min(i + 1, order.length - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [label, order.length, zoom]);

  const counts = useMemo(() => {
    const c = { total: 0, ok: 0, blurry: 0, eyes_closed: 0, both: 0, skip: 0 } as Record<Label | "total", number>;
    for (const p of photos) {
      const l = labels.get(p.id);
      if (!l) continue;
      c[l]++;
      if (l !== "skip") c.total++;
    }
    return c;
  }, [photos, labels]);
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name ?? t("ללא תיקייה");

  return (
    <div>
      <h1 className="text-[22px] font-bold mb-1 font-display">{t("סימון תמונות לבדיקת הסינון")}</h1>
      <p className="text-sm text-ink-soft mb-4 leading-relaxed">
        {t("לכל תמונה בוחרים מה נכון לגביה. הסימונים שלך הם התשובות שמולן נמדוד את מנוע הסינון. לחיצה על התמונה פותחת אותה ברזולוציה מלאה, כדי לראות אם העיניים חדות.")}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={galleryId ?? ""}
          onChange={(e) => setGalleryId(e.target.value || null)}
          aria-label={t("גלריה")}
          className="rounded-lg px-3 py-2 text-sm border border-line bg-white"
        >
          <option value="">{t("בחירת גלריה")}</option>
          {galleries.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        {folders.length > 1 && (
          <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} aria-label={t("אירוע")} className="rounded-lg px-3 py-2 text-sm border border-line bg-white">
            <option value="">{t("כל האירועים")}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!galleryId ? (
        <p className="text-sm text-ink-soft">{t("יוצרים גלריה בשם \"מודל סינון\" עם תיקייה לכל אירוע, ובוחרים אותה כאן.")}</p>
      ) : loading ? (
        <p className="text-sm text-ink-soft">{t("טוען...")}</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-ink-soft">{t("אין עדיין תמונות בגלריה הזו.")}</p>
      ) : (
        <>
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs font-semibold mb-1">
              <span>{t("סומנו {n} מתוך {target}", { n: counts.total, target: TARGET })}</span>
              <span className="font-data text-ink-soft">
                {t("תקינה {ok} · לא בפוקוס {blurry} · עיניים עצומות {eyes} · גם וגם {both}", { ok: counts.ok, blurry: counts.blurry, eyes: counts.eyes_closed, both: counts.both })}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${Math.min(100, (counts.total / TARGET) * 100)}%` }} />
            </div>
            {counts.total >= TARGET && <p className="text-xs text-sage mt-1.5">{t("הגעת ליעד. אפשר להמשיך לסמן, וכל סימון נוסף מחזק את הבדיקה.")}</p>}
          </div>

          {photo && (
            <div className="rounded-2xl bg-card p-3">
              <div className="flex items-center justify-between text-xs text-ink-soft mb-2">
                <span className="truncate">
                  {folderName(photo.folder_id)} · {photo.original_filename}
                </span>
                <span className="shrink-0 font-data">
                  {index + 1} / {order.length}
                </span>
              </div>
              <div className="flex justify-center bg-black/90 rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={photo.id}
                  src={imageUrl(photo)}
                  alt={photo.original_filename}
                  onClick={openZoom}
                  className="max-h-[62vh] w-auto object-contain cursor-zoom-in"
                />
              </div>
              {labels.get(photo.id) && (
                <p className="text-xs text-ink-soft mt-2">
                  {t("סומנה כ:")} <b className="text-ink">{t(LABELS.find((l) => l.key === labels.get(photo.id))!.text)}</b>
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                {LABELS.map((l) => (
                  <button
                    key={l.key}
                    onClick={() => void label(l.key)}
                    className={`h-11 rounded-xl text-sm font-semibold ${l.className} ${labels.get(photo.id) === l.key ? "ring-2 ring-offset-2 ring-amber-deep" : ""}`}
                  >
                    {t(l.text)} <span className="opacity-60 font-data text-xs">({l.hotkey})</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 text-xs">
                <button onClick={() => setIndex((i) => Math.max(i - 1, 0))} disabled={index === 0} className="underline text-ink-soft disabled:opacity-40">
                  {t("הקודמת")}
                </button>
                <span className="text-ink-soft">{t("מקשים: 1–4 ו-0 לסימון, חיצים למעבר, Z להגדלה")}</span>
                <button onClick={() => setIndex((i) => Math.min(i + 1, order.length - 1))} disabled={index >= order.length - 1} className="underline text-ink-soft disabled:opacity-40">
                  {t("הבאה")}
                </button>
              </div>
              {error && <p className="text-xs text-rose mt-2">{error}</p>}
            </div>
          )}
        </>
      )}

      {zoom && (
        <BodyPortal>
          <div className="fixed inset-0 z-[90] bg-black" role="dialog" aria-modal="true" aria-label={t("הגדלה")}>
            <button onClick={() => setZoom(null)} className="absolute top-3 end-3 z-10 h-10 px-4 rounded-full bg-white/90 text-sm font-semibold">
              {t("סגירה")}
            </button>
            {!zoom.url ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">{t("טוען את המקור...")}</p>
            ) : (
              <div
                className="absolute inset-0 overflow-auto"
                ref={(el) => {
                  // Once the original has its size, scroll to the point that was tapped.
                  const img = el?.querySelector("img");
                  if (!el || !img) return;
                  const center = () => {
                    el.scrollLeft = img.naturalWidth * zoom.x - el.clientWidth / 2;
                    el.scrollTop = img.naturalHeight * zoom.y - el.clientHeight / 2;
                  };
                  if (img.complete) center();
                  else img.onload = center;
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={zoom.url} alt="" className="max-w-none" onClick={() => setZoom(null)} />
              </div>
            )}
          </div>
        </BodyPortal>
      )}
    </div>
  );
}
