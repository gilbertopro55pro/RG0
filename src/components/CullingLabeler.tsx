"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/paginatedFetch";
import CullingLabelModal from "@/components/CullingLabelModal";
import CullingLookReview from "@/components/CullingLookReview";
import { useT } from "@/i18n/client";
import { FLAGS, LABEL_COLUMNS, fromRow, isDone, lookCheckPending, type LabelRow, type PhotoLabel } from "@/lib/culling/labels";

// Photo culling, round 0 (owner, 2026-10-16; app/admin/culling): labelling a test gallery by hand.
// This page is the start screen: the gallery and event, how far the labelling got, what each problem
// means (labels are only worth anything if they're consistent), and the button that opens the
// full-screen labelling (CullingLabelModal, the same screen a gallery opens). The order mixes the
// events evenly, so the first ~300 labels cover all of them. Labels: culling_labels (0178, 0180).
// Above the definitions, while any are left: the one-time check of the "not looking" marks made
// before it was clear they count only in posed photos (CullingLookReview, 0184).

type Photo = { id: string; folder_id: string | null; original_filename: string; storage_path: string };
type Folder = { id: string; name: string; sort_order: number };

const TARGET = 300;

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
  const [labels, setLabels] = useState<Map<string, PhotoLabel>>(new Map());
  const [folderFilter, setFolderFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // The photos in the look check, fixed when it opens (the list shrinks as pages are saved).
  const [review, setReview] = useState<Photo[] | null>(null);

  useEffect(() => {
    if (!galleryId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [foldersRes, photoRows, labelRows] = await Promise.all([
        supabase.from("gallery_folders").select("id, name, sort_order").eq("gallery_id", galleryId).order("sort_order").returns<Folder[]>(),
        fetchAllRows<Photo>((from, to) =>
          supabase.from("gallery_photos").select("id, folder_id, original_filename, storage_path").eq("gallery_id", galleryId).order("id").range(from, to).returns<Photo[]>()
        ),
        fetchAllRows<LabelRow>((from, to) =>
          supabase.from("culling_labels").select(LABEL_COLUMNS).eq("gallery_id", galleryId).order("photo_id").range(from, to).returns<LabelRow[]>()
        ),
      ]);
      if (cancelled) return;
      setFolders(foldersRes.data ?? []);
      setPhotos(photoRows ?? []);
      setLabels(new Map((labelRows ?? []).map((r) => [r.photo_id, fromRow(r)])));
      setFolderFilter("");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [galleryId, supabase]);

  const order = useMemo(() => mixedOrder(folderFilter ? photos.filter((p) => p.folder_id === folderFilter) : photos), [photos, folderFilter]);

  const lookPending = useMemo(() => order.filter((p) => lookCheckPending(labels.get(p.id))), [order, labels]);

  const counts = useMemo(() => {
    const c = { done: 0, fine: 0, skip: 0, blurry: 0, eyes: 0, notLooking: 0, unflattering: 0 };
    for (const p of photos) {
      const l = labels.get(p.id);
      if (!l || !isDone(l)) continue;
      if (l.skip) {
        c.skip++;
        continue;
      }
      c.done++;
      if (!FLAGS.some((f) => l.flags[f.key])) c.fine++;
      for (const f of FLAGS) if (l.flags[f.key]) c[f.key]++;
    }
    return c;
  }, [photos, labels]);

  return (
    <div>
      <h1 className="text-[22px] font-bold mb-1 font-display">{t("סימון תמונות לבדיקת הסינון")}</h1>
      <p className="text-sm text-ink-soft mb-4 leading-relaxed">
        {t("לכל תמונה מסמנים אם היא תקינה, או אילו בעיות יש בה (אפשר כמה). הסימונים שלך הם התשובות שמולן נמדוד את מנוע הסינון. לחיצה על התמונה פותחת אותה ברזולוציה מלאה.")}
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
          <div className="rounded-2xl bg-card p-4 mb-4">
            <div className="flex items-center justify-between text-sm font-semibold mb-1.5">
              <span>{t("סומנו {n} מתוך {target}", { n: counts.done, target: TARGET })}</span>
            </div>
            <div className="h-1.5 rounded-full bg-line overflow-hidden mb-2">
              <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${Math.min(100, (counts.done / TARGET) * 100)}%` }} />
            </div>
            <p className="text-xs text-ink-soft font-data leading-relaxed">
              {[`${t("תקינה")} ${counts.fine}`, ...FLAGS.map((f) => `${t(f.text)} ${counts[f.key]}`), `${t("דילוג")} ${counts.skip}`].join(" · ")}
            </p>
            {counts.done >= TARGET && <p className="text-xs text-sage mt-1.5">{t("הגעת ליעד. אפשר להמשיך לסמן, וכל סימון נוסף מחזק את הבדיקה.")}</p>}
            <button onClick={() => setOpen(true)} className="mt-3 w-full sm:w-auto h-12 px-6 rounded-xl text-sm font-semibold bg-ink text-white">
              {counts.done + counts.skip > 0 ? t("המשך סימון") : t("התחלת סימון")}
            </button>
          </div>

          {lookPending.length > 0 && (
            <div className="rounded-2xl bg-card p-4 mb-4 border border-amber-deep/40">
              <p className="text-sm font-semibold mb-1">{t("בדיקה חוזרת: מבט לא למצלמה")}</p>
              <p className="text-xs text-ink-soft leading-relaxed">
                {t("מבט לא למצלמה נספר רק בתמונה מבוימת. {n} תמונות סומנו כך לפני שההגדרה הובהרה, וחלק גדול מהן ספונטניות. עוברים עליהן ברשת של 12, ולוחצים על הספונטניות כדי להסיר מהן את הסימון. עד שהבדיקה תסתיים, אי אפשר למדוד את המנוע על מבט.", { n: lookPending.length })}
              </p>
              <button onClick={() => setReview(lookPending)} className="mt-3 w-full sm:w-auto h-12 px-6 rounded-xl text-sm font-semibold bg-ink text-white">
                {t("בדיקת {n} התמונות", { n: lookPending.length })}
              </button>
            </div>
          )}

          <div className="rounded-2xl bg-card p-4">
            <p className="text-sm font-semibold mb-2">{t("מה מסמנים")}</p>
            <ul className="text-xs text-ink-soft space-y-1.5 leading-relaxed">
              <li>
                <b className="text-ink">{t("תקינה")}:</b> {t("אין בה אף אחת מהבעיות. מסמנים מה קרה בתמונה, לא אם היא יפה.")}
              </li>
              {FLAGS.map((f) => (
                <li key={f.key}>
                  <b className="text-ink">{t(f.text)}:</b> {t(f.hint)}
                </li>
              ))}
              <li>
                <b className="text-ink">{t("דילוג")}:</b> {t("רק כשלא בטוחים. ניחוש מקלקל את המדידה.")}
              </li>
            </ul>
          </div>
        </>
      )}

      {open && galleryId && (
        <CullingLabelModal
          photos={order}
          galleryId={galleryId}
          userId={userId}
          onLabel={(id, l) =>
            setLabels((cur) => {
              const next = new Map(cur);
              if (l) next.set(id, l);
              else next.delete(id);
              return next;
            })
          }
          onClose={() => setOpen(false)}
        />
      )}

      {review && galleryId && (
        <CullingLookReview
          photos={review}
          galleryId={galleryId}
          onChecked={(candid, posed) =>
            setLabels((cur) => {
              const next = new Map(cur);
              for (const [ids, notLooking] of [[candid, false], [posed, true]] as const) {
                for (const id of ids) {
                  const l = next.get(id);
                  if (l) next.set(id, { ...l, flags: { ...l.flags, notLooking }, lookChecked: true });
                }
              }
              return next;
            })
          }
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}
