"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AlbumElement, AlbumFrame } from "@/lib/types";
import type { PhotoWithUrl } from "@/components/galleryManage/types";
import {
  albumPoolIds,
  selectionDiff,
  selectionPlan,
  type LeftoverFrames,
  type LeftoverPhotos,
  type SelectionPhoto,
  type SelectionSpread,
  type Slot,
} from "@/lib/albumSelection";

// The album selection in the gallery's favorites view (owner, 2026-10-27; lib/albumSelection.ts):
// the picks being made (saved as a draft as they're tapped), confirming them as the final
// selection, and what that does to an album that already exists. GalleryManageView draws it with
// AlbumSelectionBar and AlbumSelectionConfirm.

export type AlbumSelectionGallery = {
  id: string;
  album_picks?: string[] | null;
  album_selection?: string[] | null;
};
type AlbumRow = { id: string; status: string; width_cm: number; height_cm: number; safe_margin_cm: number | null };

// A confirmed selection that changes an album waits here for the photographer's choice.
export type PendingSelectionChange = {
  selection: string[];
  album: AlbumRow;
  spreads: SelectionSpread[];
  removed: Slot[];
  added: string[];
};
export type SelectionNotice = { kind: "ok" | "error"; text: string };
type T = (key: string, vars?: Record<string, string | number>) => string;

const SAVE_DELAY_MS = 600;

export function useAlbumSelection({
  gallery,
  photos,
  onGalleryPatch,
  onAlbumChanged,
  t,
}: {
  gallery: AlbumSelectionGallery;
  photos: PhotoWithUrl[];
  onGalleryPatch: (patch: { album_picks: string[]; album_selection?: string[] | null; album_selection_at?: string | null }) => void;
  onAlbumChanged: () => void;
  t: T;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [filtering, setFiltering] = useState(false);
  const [view, setView] = useState<"all" | "picked" | "unpicked">("all");
  const [picks, setPicks] = useState<Set<string>>(() => new Set(gallery.album_picks?.length ? gallery.album_picks : (gallery.album_selection ?? [])));
  const [pending, setPending] = useState<PendingSelectionChange | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<SelectionNotice | null>(null);
  const confirmed = gallery.album_selection ?? null;

  // The draft, saved a moment after the last tap (the whole list, so taps never race each other).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(picks);
  const saveDraft = async (ids: string[]) => {
    const { error } = await supabase.from("galleries").update({ album_picks: ids }).eq("id", gallery.id);
    if (!error) onGalleryPatch({ album_picks: ids });
    return !error;
  };
  const inOrder = (set: Set<string>) => photos.filter((p) => set.has(p.id)).map((p) => p.id);
  const flushDraft = async () => {
    if (!saveTimer.current) return true;
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    return saveDraft(inOrder(latest.current));
  };
  const changePicks = (next: Set<string>) => {
    latest.current = next;
    setPicks(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void saveDraft(inOrder(latest.current));
    }, SAVE_DELAY_MS);
  };
  useEffect(
    () => () => {
      // Leaving the page with taps not yet saved.
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void supabase.from("galleries").update({ album_picks: [...latest.current] }).eq("id", gallery.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on unmount only
    []
  );
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const toggle = (id: string) => {
    const next = new Set(picks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    changePicks(next);
  };
  const pickAll = (ids: string[]) => changePicks(new Set([...picks, ...ids]));
  const clearAll = (ids: string[]) => {
    const drop = new Set(ids);
    changePicks(new Set([...picks].filter((id) => !drop.has(id))));
  };

  const saveSelection = async (selection: string[]) => {
    const patch = { album_selection: selection, album_selection_at: new Date().toISOString(), album_picks: selection };
    const { error } = await supabase.from("galleries").update(patch).eq("id", gallery.id);
    if (error) return false;
    onGalleryPatch(patch);
    return true;
  };

  // "אישור בחירה סופית": saved at once when there's no album or the album doesn't change; otherwise
  // the photographer sees what changes first (AlbumSelectionConfirm).
  const confirm = async () => {
    if (busy) return;
    const selection = inOrder(latest.current);
    if (!selection.length) {
      setNotice({ kind: "error", text: t("לא נבחרו תמונות. סמנו את התמונות לאלבום ואז אשרו.") });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await flushDraft();
      const previousPool = new Set(albumPoolIds(photos, confirmed));
      const { data: album } = await supabase
        .from("gallery_albums")
        .select("id, status, width_cm, height_cm, safe_margin_cm")
        .eq("gallery_id", gallery.id)
        .maybeSingle<AlbumRow>();
      let spreads: SelectionSpread[] = [];
      if (album) {
        const { data } = await supabase
          .from("gallery_album_spreads")
          .select("id, sort_order, elements, background_photo_id, width_cm, height_cm, marked_frames")
          .eq("album_id", album.id)
          .order("sort_order")
          .returns<SelectionSpread[]>();
        spreads = data ?? [];
      }
      const { removed, added } = selectionDiff(spreads, previousPool, selection, confirmed === null);
      if (!album || (!removed.length && !added.length)) {
        if (!(await saveSelection(selection))) throw new Error("save");
        setFiltering(false);
        setNotice({ kind: "ok", text: t("הבחירה נשמרה. תמונות בכלי עיצוב האלבום: {n}.", { n: selection.length }) });
        return;
      }
      setPending({ selection, album, spreads, removed, added });
    } catch {
      setNotice({ kind: "error", text: t("השמירה נכשלה. נסו שוב") });
    } finally {
      setBusy(false);
    }
  };

  // The photographer's choice for the album, then the selection itself.
  const apply = async (options: { leftoverFrames?: LeftoverFrames; leftoverPhotos?: LeftoverPhotos }) => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const { selection, album, spreads, removed, added } = pending;
      const [{ data: faceRows }, { data: templates }] = await Promise.all([
        added.length
          ? supabase
              .from("gallery_photo_faces")
              .select("photo_id, box_x, box_y, box_width, box_height")
              .eq("gallery_id", gallery.id)
              .in("photo_id", added.slice(0, 300))
              .returns<{ photo_id: string; box_x: number; box_y: number; box_width: number; box_height: number }[]>()
          : Promise.resolve({ data: [] as { photo_id: string; box_x: number; box_y: number; box_width: number; box_height: number }[] }),
        supabase.from("album_templates").select("frames").returns<{ frames: AlbumFrame[] }[]>(),
      ]);
      const faces = new Map<string, { x: number; y: number; width: number; height: number }[]>();
      for (const r of faceRows ?? []) faces.set(r.photo_id, [...(faces.get(r.photo_id) ?? []), { x: r.box_x, y: r.box_y, width: r.box_width, height: r.box_height }]);
      const selPhotos: SelectionPhoto[] = photos.map((p) => ({
        id: p.id,
        folder_id: p.folder_id,
        aspect: p.preview_aspect_ratio && p.preview_aspect_ratio > 0 ? p.preview_aspect_ratio : 1.5,
        ...(faces.get(p.id)?.length ? { faces: faces.get(p.id) } : {}),
      }));
      const plan = selectionPlan({
        spreads,
        removed,
        added,
        photos: selPhotos,
        album: { width_cm: album.width_cm, height_cm: album.height_cm, safe_margin_cm: album.safe_margin_cm ?? undefined },
        userTemplates: (templates ?? []).map((row) => row.frames),
        leftoverFrames: options.leftoverFrames,
        leftoverPhotos: options.leftoverPhotos,
        idPrefix: `sel${Date.now().toString(36)}`,
      });
      const updates = [...plan.patches].map(([id, patch]) =>
        supabase.from("gallery_album_spreads").update({ ...patch, layout: "custom" }).eq("id", id)
      );
      const deletes = plan.deleted.map((id) => supabase.from("gallery_album_spreads").delete().eq("id", id));
      const lastOrder = Math.max(-1, ...spreads.map((sp) => sp.sort_order));
      const inserts = plan.newPages.map((page, i) =>
        supabase
          .from("gallery_album_spreads")
          .insert({
            album_id: album.id,
            sort_order: lastOrder + 1 + i,
            layout: "custom",
            elements: page.elements,
            marked_frames: page.marked_frames,
            photo_id_1: firstPhoto(page.elements),
          })
          .select("id")
          .single<{ id: string }>()
      );
      const [updated, removedRows, inserted] = await Promise.all([Promise.all(updates), Promise.all(deletes), Promise.all(inserts)]);
      if ([...updated, ...removedRows, ...inserted].some((r) => r.error)) throw new Error("album");
      // The pages' rendered snapshots follow, like after the editor.
      for (const id of [...plan.patches.keys(), ...inserted.map((r) => r.data?.id).filter((id): id is string => !!id)]) {
        fetch(`/api/album-spreads/${id}/render-preview`, { method: "POST" }).catch(() => {});
      }
      if (!(await saveSelection(selection))) throw new Error("save");
      setPending(null);
      setFiltering(false);
      onAlbumChanged();
      const parts = [t("הבחירה נשמרה.")];
      if (plan.replaced) parts.push(t("תמונות שהוחלפו באלבום: {n}.", { n: plan.replaced }));
      if (plan.emptied) parts.push(t("מסגרות שנשארו ריקות: {n}.", { n: plan.emptied }));
      if (plan.removedFrames) parts.push(t("מסגרות שנמחקו: {n}.", { n: plan.removedFrames }));
      if (plan.redesigned) parts.push(t("דפים שעוצבו מחדש: {n}.", { n: plan.redesigned }));
      if (plan.newPages.length) parts.push(t("דפים חדשים בסוף האלבום: {n}.", { n: plan.newPages.length }));
      if (plan.deleted.length) parts.push(t("דפים שנשארו בלי תמונות ונמחקו: {n}.", { n: plan.deleted.length }));
      parts.push(t("התמונות החדשות מסומנות בנקודה אדומה."));
      setNotice({ kind: "ok", text: parts.join(" ") });
    } catch {
      // Part of the album may have changed: show it as it is now.
      onAlbumChanged();
      setNotice({ kind: "error", text: t("עדכון האלבום נכשל. נסו שוב") });
    } finally {
      setBusy(false);
    }
  };

  // Back to the favorites: the album tools offer them again. The album itself doesn't change.
  const clearSelection = async () => {
    if (busy) return;
    setBusy(true);
    const patch = { album_selection: null, album_selection_at: null, album_picks: [] as string[] };
    const { error } = await supabase.from("galleries").update(patch).eq("id", gallery.id);
    setBusy(false);
    if (error) {
      setNotice({ kind: "error", text: t("השמירה נכשלה. נסו שוב") });
      return;
    }
    latest.current = new Set();
    setPicks(new Set());
    onGalleryPatch(patch);
    setFiltering(false);
    setNotice({ kind: "ok", text: t("הבחירה לאלבום בוטלה. כלי עיצוב האלבום מציג שוב את המועדפות.") });
  };

  const start = () => {
    setView("all");
    setNotice(null);
    setFiltering(true);
  };
  const stop = () => {
    void flushDraft();
    setFiltering(false);
  };

  return {
    filtering,
    start,
    stop,
    view,
    setView,
    picks,
    toggle,
    pickAll,
    clearAll,
    confirmed,
    confirm,
    pending,
    cancelPending: () => setPending(null),
    apply,
    clearSelection,
    busy,
    notice,
    dismissNotice: () => setNotice(null),
  };
}

function firstPhoto(elements: AlbumElement[]): string | null {
  for (const el of elements) if (el.type === "photo" && el.photoId) return el.photoId;
  return null;
}
