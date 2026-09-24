"use client";

import { useState } from "react";

export type RowMenuItem = {
  label: string;
  onClick: () => void;
  // Destructive: asks "בטוח?" in place before running, so one stray tap can't delete anything.
  danger?: boolean;
};

// The "⋯" menu at the end of a list row (design stage 5): secondary and destructive actions live
// here instead of as loose red text next to the main buttons.
export default function RowMenu({ items, label = "עוד פעולות" }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);

  const close = () => {
    setOpen(false);
    setConfirming(null);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className="h-9 w-9 rounded-lg border border-line flex items-center justify-center text-ink-soft"
        style={{ background: "var(--color-input-bg)" }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 gf-no-enter" onClick={close} />
          <div className="absolute end-0 bottom-11 z-50 min-w-44 rounded-2xl bg-paper shadow-sheet border border-line overflow-hidden text-sm">
            {items.map((item, i) => (
              <button
                key={item.label}
                type="button"
                data-press="tint"
                onClick={() => {
                  if (item.danger && confirming !== i) {
                    setConfirming(i);
                    return;
                  }
                  close();
                  item.onClick();
                }}
                className={`w-full text-start px-4 py-3 ${i > 0 ? "border-t border-line" : ""} ${item.danger ? "text-rose font-semibold" : ""}`}
              >
                {item.danger && confirming === i ? `בטוח? ${item.label}` : item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
