"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

export type GlassTabStripItem = {
  key: string;
  label: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: number;
  // Rendered as a round gradient badge above the label (icon-top, label-below — the standard
  // premium tab-bar layout) instead of the plain text-only cell. Omit for a text-only item.
  icon?: ReactNode;
  iconBg?: string;
  // Icon-only: no label under the badge (label is still used as the accessible name). Also
  // shrinks the badge itself — meant for a denser strip with more items, like the top nav.
  hideLabel?: boolean;
};

// A shared "segmented glass strip" used both for the top-level page nav and for a gallery's own
// action row: equal-width cells (never side-scrolling — long labels truncate instead, a
// deliberate trade-off for a strip that always fits), a hairline divider between cells for a
// quieter, more considered look than individual button chrome, and one shared indicator bar that
// slides to whichever cell is active instead of each cell drawing its own static underline.
export default function GlassTabStrip({ items, className }: { items: GlassTabStripItem[]; className?: string }) {
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  // Separate refs for just the round icon badge (not the whole cell) — an icon-only item's
  // indicator should track the badge's own width, not the wider equal-width cell around it,
  // otherwise it visibly overhangs the icon on both sides.
  const iconRefs = useRef<(HTMLElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const activeKey = items.find((i) => i.active)?.key ?? null;

  useEffect(() => {
    const measure = () => {
      const activeIndex = items.findIndex((i) => i.active);
      if (activeIndex < 0) {
        setIndicator(null);
        return;
      }
      const iconEl = iconRefs.current[activeIndex];
      const cellEl = itemRefs.current[activeIndex];
      const el = iconEl ?? cellEl;
      if (!el || !cellEl) {
        setIndicator(null);
        return;
      }
      // offsetLeft is relative to each element's own offsetParent, which for the icon badge is
      // the cell itself — add the cell's own offset so both cases end up relative to the strip.
      const left = el === cellEl ? cellEl.offsetLeft : cellEl.offsetLeft + el.offsetLeft;
      setIndicator({ left, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, items.length]);

  return (
    <div className={`relative flex items-stretch overflow-hidden rounded-2xl bg-card shadow-card ${className ?? ""}`}>
      {items.map((item, i) => {
        const style = {
          color: item.active ? "var(--color-amber-deep)" : "var(--color-ink-soft)",
          borderInlineStart: i === 0 ? "none" : "1px solid var(--color-line)",
        };
        const setRef = (el: HTMLElement | null) => {
          itemRefs.current[i] = el;
        };
        const badge =
          item.badge && item.badge > 0 ? (
            <span
              className="absolute top-0.5 left-1/2 min-w-[15px] h-[15px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none shadow z-10"
              style={{ background: "var(--color-rose)" }}
            >
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          ) : null;

        const badgeCircle = (
          <span
            ref={(el: HTMLSpanElement | null) => {
              iconRefs.current[i] = el;
            }}
            className={`flex shrink-0 items-center justify-center rounded-full transition-transform ${item.hideLabel ? (item.iconBg ? "h-7 w-7" : "h-9 w-9") : "h-8 w-8"}`}
            style={
              item.iconBg
                ? {
                    background: item.iconBg,
                    color: "#ffffff",
                    boxShadow: item.active
                      ? "inset 0 1px 0 rgba(255,255,255,0.4), 0 3px 8px rgba(0,0,0,0.22)"
                      : "inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 5px rgba(0,0,0,0.14)",
                    opacity: item.active ? 1 : 0.82,
                    transform: item.active ? "scale(1.06)" : "scale(1)",
                  }
                : {
                    // Monochrome: the icon takes the cell's own color (brass when active), with a
                    // soft brass wash behind the active one instead of a colored badge.
                    background: item.active ? "var(--color-amber-bg)" : "transparent",
                    color: item.active ? "var(--color-amber-deep)" : "var(--color-ink)",
                    transition: "background 200ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }
            }
          >
            {item.icon}
          </span>
        );

        const content = item.icon ? (
          item.hideLabel ? (
            badgeCircle
          ) : (
            <span className="flex w-full min-w-0 flex-col items-center gap-1">
              {badgeCircle}
              <span className="block w-full truncate text-center text-[10px] md:text-xs leading-none">{item.label}</span>
            </span>
          )
        ) : (
          <span className="truncate">{item.label}</span>
        );

        const cls = item.icon
          ? "relative flex-1 min-w-0 px-1 py-2.5 flex justify-center items-center text-center text-xs md:text-sm font-semibold"
          : "relative flex-1 min-w-0 truncate px-1.5 py-2.5 text-center text-xs md:text-sm font-semibold";

        if (item.href) {
          return (
            <Link key={item.key} href={item.href} ref={setRef} className={cls} style={style} aria-label={item.hideLabel ? item.label : undefined} title={item.hideLabel ? item.label : undefined}>
              {content}
              {badge}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            ref={setRef}
            onClick={item.onClick}
            disabled={item.disabled}
            className={`${cls} disabled:opacity-60`}
            style={style}
            aria-label={item.hideLabel ? item.label : undefined}
            title={item.hideLabel ? item.label : undefined}
          >
            {content}
            {badge}
          </button>
        );
      })}
      {indicator && (
        <div
          className="absolute bottom-0 h-[2px] rounded-full"
          style={{
            left: indicator.left,
            width: indicator.width,
            background: "var(--color-amber-deep)",
            transition: "left 250ms cubic-bezier(0.4,0,0.2,1), width 250ms cubic-bezier(0.4,0,0.2,1)",
          }}
        />
      )}
    </div>
  );
}
