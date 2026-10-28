"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import BodyPortal from "@/components/BodyPortal";
import { folderTree, type GalleryFolderNode } from "@/lib/galleryFolders";

// "עריכת לשונית" (double-click on a tab, owner 2026-10-28): its name, the main tab it sits in, a new
// sub-tab under it, and deleting it. Two levels only: a tab with sub-tabs stays a main tab, and a
// sub-tab gets no sub-tabs of its own.
export default function TabEditSheet({
  folder,
  folders,
  onSave,
  onAddSubTab,
  onDelete,
  onClose,
}: {
  folder: GalleryFolderNode;
  folders: GalleryFolderNode[];
  onSave: (name: string, parentId: string | null) => Promise<string | null>;
  onAddSubTab: (name: string) => Promise<string | null>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(folder.name);
  const [parentId, setParentId] = useState<string>(folder.parent_id ?? "");
  const [subName, setSubName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSubTabs = folders.some((f) => f.parent_id === folder.id);
  const isMain = !folder.parent_id;
  const mains = folderTree(folders)
    .map((n) => n.folder)
    .filter((f) => f.id !== folder.id && !f.parent_id);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    const err = await onSave(trimmed, parentId || null);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  const addSub = async () => {
    const trimmed = subName.trim();
    if (!trimmed) return;
    setBusy(true);
    const err = await onAddSubTab(trimmed);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" style={{ background: "rgba(28, 27, 25, 0.55)" }} onClick={() => !busy && onClose()}>
        <div
          className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 bg-paper shadow-sheet max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={t("עריכת לשונית")}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-bold mb-4 font-display">{t("עריכת לשונית")}</h2>

          <label className="block text-xs font-semibold text-ink-soft mb-1" htmlFor="tab-edit-name">
            {t("שם הלשונית")}
          </label>
          <input
            id="tab-edit-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") onClose();
            }}
            className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white text-ink mb-4"
          />

          {!hasSubTabs && (
            <>
              <label className="block text-xs font-semibold text-ink-soft mb-1" htmlFor="tab-edit-parent">
                {t("לשונית ראשית")}
              </label>
              <select
                id="tab-edit-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white text-ink mb-1"
              >
                <option value="">{t("ללא, זו לשונית ראשית")}</option>
                {mains.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-soft mb-4">{t("לשונית שנמצאת בתוך לשונית ראשית מופיעה כתת-לשונית שלה.")}</p>
            </>
          )}

          <div className="flex gap-2 mb-4">
            <button onClick={() => void save()} disabled={busy || !name.trim()} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-50">
              {t("שמירה")}
            </button>
            <button onClick={onClose} disabled={busy} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
              {t("ביטול")}
            </button>
          </div>

          {isMain && (
            <div className="border-t border-line pt-4 mb-4">
              <label className="block text-xs font-semibold text-ink-soft mb-1" htmlFor="tab-edit-sub">
                {t("תת-לשונית חדשה בתוך \"{name}\"", { name: folder.name })}
              </label>
              <div className="flex gap-2">
                <input
                  id="tab-edit-sub"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addSub();
                  }}
                  placeholder={t("שם תת-הלשונית")}
                  className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm border border-line bg-white text-ink"
                />
                <button onClick={() => void addSub()} disabled={busy || !subName.trim()} className="shrink-0 rounded-lg px-4 text-sm font-semibold bg-white border border-ink text-ink disabled:opacity-50">
                  {t("הוספה")}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-rose mb-3">{error}</p>}

          <button onClick={onDelete} disabled={busy} className="text-sm font-semibold text-rose underline disabled:opacity-50">
            {t("מחיקת הלשונית")}
          </button>
        </div>
      </div>
    </BodyPortal>
  );
}
