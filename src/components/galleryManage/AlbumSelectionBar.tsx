"use client";

import { useT } from "@/i18n/client";
import { BTN_PRESS } from "@/lib/viewTransition";
import type { SelectionNotice } from "@/components/galleryManage/useAlbumSelection";

// The album selection's bar in the favorites view (owner, 2026-10-27; lib/albumSelection.ts):
// before narrowing, a button to start and what the album tools offer now; while narrowing, how many
// are picked, quick picks, a view filter, and "אישור בחירה סופית".
export default function AlbumSelectionBar({
  filtering,
  pickedCount,
  totalCount,
  confirmedCount,
  view,
  onView,
  onStart,
  onStop,
  onPickAll,
  onClearAll,
  onConfirm,
  onClearSelection,
  busy,
  notice,
  onDismissNotice,
}: {
  filtering: boolean;
  pickedCount: number;
  totalCount: number;
  confirmedCount: number | null;
  view: "all" | "picked" | "unpicked";
  onView: (v: "all" | "picked" | "unpicked") => void;
  onStart: () => void;
  onStop: () => void;
  onPickAll: () => void;
  onClearAll: () => void;
  onConfirm: () => void;
  onClearSelection: () => void;
  busy: boolean;
  notice: SelectionNotice | null;
  onDismissNotice: () => void;
}) {
  const t = useT();
  const chip = (active: boolean) => ({
    background: active ? "var(--color-ink)" : "var(--color-chip)",
    color: active ? "var(--color-paper)" : "var(--color-ink-soft)",
  });
  const noticeBox = notice && (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className="mt-2 rounded-xl px-3 py-2 text-xs leading-relaxed flex items-start justify-between gap-2"
      style={{
        background: notice.kind === "error" ? "color-mix(in srgb, var(--color-rose) 12%, transparent)" : "color-mix(in srgb, var(--color-sage) 14%, transparent)",
        color: notice.kind === "error" ? "var(--color-rose)" : "var(--color-ink)",
      }}
    >
      <span>{notice.text}</span>
      <button type="button" onClick={onDismissNotice} aria-label={t("סגירה")} className="shrink-0 text-ink-soft">
        ✕
      </button>
    </div>
  );

  if (!filtering) {
    return (
      <div className="mb-3 -mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onStart}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold border border-line bg-white text-ink ${BTN_PRESS}`}
          >
            {confirmedCount != null ? t("עריכת הבחירה לאלבום") : t("סינון נוסף לאלבום")}
          </button>
          <span className="text-[11px] text-ink-soft">
            {confirmedCount != null
              ? t("בכלי עיצוב האלבום: הבחירה הסופית, {n} תמונות", { n: confirmedCount })
              : t("בכלי עיצוב האלבום: כל המועדפות")}
          </span>
          {confirmedCount != null && (
            <button type="button" onClick={onClearSelection} disabled={busy} className="text-[11px] font-semibold text-ink-soft underline disabled:opacity-50">
              {t("חזרה למועדפות")}
            </button>
          )}
        </div>
        {noticeBox}
      </div>
    );
  }

  return (
    <div
      className="sticky z-20 mb-3 rounded-2xl border border-line bg-white/95 p-3 shadow-card backdrop-blur"
      // Below the app's top bar (TopNav, sticky too, 75px high).
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 83px)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold">{t("סינון נוסף לאלבום")}</div>
          <div className="text-xs text-ink-soft mt-0.5">
            {t("נבחרו {n} מתוך {total}. לחיצה על תמונה מסמנת אותה לאלבום.", { n: pickedCount, total: totalCount })}
          </div>
        </div>
        <button type="button" onClick={onStop} className="shrink-0 text-xs font-semibold text-ink-soft underline">
          {t("יציאה")}
        </button>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        {(
          [
            ["all", t("הכל")],
            ["picked", t("נבחרו")],
            ["unpicked", t("לא נבחרו")],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => onView(id)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${BTN_PRESS}`} style={chip(view === id)}>
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <button type="button" onClick={onPickAll} className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-chip text-ink-soft">
          {t("סימון הכל")}
        </button>
        <button type="button" onClick={onClearAll} className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-chip text-ink-soft">
          {t("ניקוי הסימון")}
        </button>
      </div>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || pickedCount === 0}
        className={`mt-3 w-full h-11 rounded-xl text-sm font-bold text-white disabled:opacity-50 ${BTN_PRESS}`}
        style={{ background: "var(--color-ink)" }}
      >
        {busy ? t("שומר…") : t("אישור בחירה סופית ({n})", { n: pickedCount })}
      </button>
      {noticeBox}
    </div>
  );
}
