"use client";

import { useT } from "@/i18n/client";
import { folderTree, tabCheckState, toggleTabKey, type GalleryFolderLike } from "@/lib/galleryFolders";

// "אילו לשוניות לשתף?": every main tab with its sub-tabs indented under it (owner, 2026-10-28).
// Checking a main tab checks its sub-tabs; one sub-tab alone leaves the main tab half-checked.
// Shared by the gallery page's share window and the galleries list's quick share.
export default function TabPicker({
  folders,
  selected,
  onChange,
  noFolderKey,
  hasUnfoldered,
}: {
  folders: GalleryFolderLike[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  noFolderKey: string;
  hasUnfoldered: boolean;
}) {
  const t = useT();
  const row = (id: string, label: string, sub: boolean) => {
    const state = tabCheckState(selected, folders, id);
    return (
      <label key={id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm ${sub ? "ms-6" : ""}`}>
        <input
          type="checkbox"
          checked={state === "on"}
          ref={(el) => {
            if (el) el.indeterminate = state === "some";
          }}
          onChange={() => onChange(toggleTabKey(selected, folders, id))}
        />
        {label}
      </label>
    );
  };
  return (
    <div className="space-y-1.5">
      {folderTree(folders).flatMap(({ folder, children }) => [row(folder.id, folder.name, false), ...children.map((c) => row(c.id, c.name, true))])}
      {hasUnfoldered && (
        <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
          <input
            type="checkbox"
            checked={selected.has(noFolderKey)}
            onChange={() => {
              const next = new Set(selected);
              if (next.has(noFolderKey)) next.delete(noFolderKey);
              else next.add(noFolderKey);
              onChange(next);
            }}
          />
          {t("כללי (ללא לשונית)")}
        </label>
      )}
    </div>
  );
}
