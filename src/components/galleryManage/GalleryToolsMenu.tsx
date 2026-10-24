"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/i18n/client";
import { dirOf } from "@/i18n/config";

export type GalleryToolItem = { key: string; label: string; onClick: () => void; disabled?: boolean; icon: ReactNode };

const EDGE = 8;

// The gallery's "כלים" dropdown (owner, 2026-10-24: "לרשימה נפתחת בשביל לחסוך מקום"): the photo
// slideshow, reels, the collage and face detection, under one button of the gallery's action row.
// Portaled to <body> with fixed coordinates from the button (like RowMenu): the action row scrolls
// sideways on a phone and its glass strip clips what leaves it.
export default function GalleryToolsMenu({ anchor, items, onClose }: { anchor: HTMLElement; items: GalleryToolItem[]; onClose: () => void }) {
  const lang = useLang();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const button = anchor.getBoundingClientRect();
      const panel = panelRef.current;
      if (!panel) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Under the button (the row sits at the top of the screen), above it when there's no room.
      const top = button.bottom + 6 + h <= vh - EDGE ? button.bottom + 6 : button.top - h - 6;
      // Centred under a wide button (an equal-width cell of the glass strip, its label in the middle),
      // else lined up with its start edge (its right side in Hebrew); kept inside the screen.
      const start = button.width > w ? button.left + (button.width - w) / 2 : dirOf(lang) === "rtl" ? button.right - w : button.left;
      const left = Math.min(Math.max(EDGE, start), vw - w - EDGE);
      setPos({ top: Math.max(EDGE, top), left: Math.max(EDGE, left) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, lang, items.length]);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[130] gf-no-enter" onClick={onClose} />
      <div
        ref={panelRef}
        role="menu"
        dir={dirOf(lang)}
        className="fixed z-[131] min-w-52 max-w-[calc(100vw-16px)] rounded-2xl bg-paper shadow-sheet border border-line overflow-hidden text-sm"
        // Measured invisibly first, then shown at the clamped position.
        style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
      >
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            data-press="tint"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick();
            }}
            className={`w-full flex items-center gap-3 text-start px-4 py-3 disabled:opacity-60 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-soft" aria-hidden="true">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">{item.label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}
