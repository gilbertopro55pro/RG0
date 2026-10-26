"use client";

import { useT } from "@/i18n/client";

export type ListOrGrid = "list" | "grid";

// Switches a page between a list and blocks: the galleries (lib/galleriesView.ts) and the home
// screen's events (lib/eventQuickActions.ts), each remembered on the device in its own cookie.
export default function ViewToggle({ view, onChange }: { view: ListOrGrid; onChange: (view: ListOrGrid) => void }) {
  const t = useT();
  const options: { value: ListOrGrid; label: string; icon: React.ReactNode }[] = [
    {
      value: "list",
      label: t("תצוגת רשימה"),
      icon: (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="4.5" width="5" height="5" rx="1" />
          <rect x="3" y="14.5" width="5" height="5" rx="1" />
          <path d="M11.5 7h9.5M11.5 17h9.5" />
        </svg>
      ),
    },
    {
      value: "grid",
      label: t("תצוגת בלוקים"),
      icon: (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
        </svg>
      ),
    },
  ];
  return (
    <div className="flex shrink-0 rounded-full border border-line bg-white p-0.5" role="group" aria-label={t("תצוגה")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={view === o.value}
          aria-label={o.label}
          title={o.label}
          className="flex h-8 w-9 items-center justify-center rounded-full transition-colors"
          style={view === o.value ? { background: "var(--color-ink)", color: "var(--color-paper)" } : { color: "var(--color-ink-soft)" }}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
