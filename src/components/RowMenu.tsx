"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang, useT } from "@/i18n/client";
import { dirOf } from "@/i18n/config";

export type RowMenuItem = {
  label: string;
  onClick: () => void;
  // Destructive: asks "בטוח?" in place before running, so one stray tap can't delete anything.
  danger?: boolean;
};

const EDGE = 8;

// The "⋯" menu at the end of a list row (design stage 5): secondary and destructive actions live
// here instead of as loose red text next to the main buttons.
//
// The panel is portaled to <body> and placed with fixed coordinates from the button, clamped to the
// viewport: anchored to the button's side, it opened off-screen whenever the row's buttons wrapped
// and pushed the button to the other edge (found on the leads screen, 2026-09-26), and an animated
// or overflow-hidden card around it could clip or shift it.
export default function RowMenu({ items, label = "עוד פעולות" }: { items: RowMenuItem[]; label?: string }) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setConfirming(null);
    setPos(null);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = buttonRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!button || !panel) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Above the button when there's room (the row's actions sit at the bottom of a card), else below.
      const top = button.top - h - 6 >= EDGE ? button.top - h - 6 : Math.min(button.bottom + 6, vh - h - EDGE);
      // Lined up with the button's left edge, pulled back inside the screen on either side.
      const left = Math.min(Math.max(EDGE, button.left), vw - w - EDGE);
      setPos({ top: Math.max(EDGE, top), left: Math.max(EDGE, left) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, confirming]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={t(label)}
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
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[130] gf-no-enter" onClick={close} />
            <div
              ref={panelRef}
              dir={dirOf(lang)}
              className="fixed z-[131] min-w-44 max-w-[calc(100vw-16px)] rounded-2xl bg-paper shadow-sheet border border-line overflow-hidden text-sm"
              // Measured invisibly first, then shown at the clamped position.
              style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
            >
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
                  {item.danger && confirming === i ? t("בטוח? {label}", { label: t(item.label) }) : t(item.label)}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
