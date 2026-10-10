"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CURRENT_VERSION } from "@/lib/changelog";
import { useT } from "@/i18n/client";

export default function SettingsTabs({
  tabs,
  initialTab,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
  // ?tab=<id> on /settings opens that tab (e.g. the new-lead popup's link to notifications).
  initialTab?: string;
}) {
  const t = useT();
  const [active, setActive] = useState(tabs.some((tab) => tab.id === initialTab) ? initialTab : tabs[0]?.id);

  // Opening "עדכונים" counts as seeing the latest version, like closing the "מה חדש" popup: clears
  // the dot on the settings icons (TopNav, SettingsGearLink).
  useEffect(() => {
    if (active !== "updates") return;
    try {
      localStorage.setItem("changelog-seen-version", CURRENT_VERSION);
    } catch {}
    window.dispatchEvent(new Event("changelog-seen-change"));
  }, [active]);

  return (
    <div>
      {/* The screen picker stands out (owner, 2026-10-10: "שהרשימה תהיה בולטת יותר"): it's how every
          other settings screen is reached, and as a plain white field it read like one more form
          input. Ink on paper flips with the theme, so it stays high-contrast in dark mode too. */}
      <label htmlFor="settings-screen" className="block text-xs font-semibold text-ink-soft mb-1.5">
        {t("בחירת מסך בהגדרות")}
      </label>
      <div className="relative mb-5">
        <span className="pointer-events-none absolute inset-y-0 start-4 z-10 flex items-center text-paper" aria-hidden="true">
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
            <circle cx="16" cy="6" r="2" />
            <circle cx="10" cy="12" r="2" />
            <circle cx="18" cy="18" r="2" />
          </svg>
        </span>
        <select
          id="settings-screen"
          value={active}
          onChange={(e) => setActive(e.target.value)}
          className="w-full appearance-none rounded-2xl ps-12 pe-12 py-3.5 text-base font-bold bg-ink text-paper shadow-card cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep focus-visible:ring-offset-2"
        >
          {tabs.map((tab) => (
            // The open list keeps the regular colors, so it reads like any other menu.
            <option key={tab.id} value={tab.id} className="bg-paper text-ink font-semibold">
              {tab.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 end-4 z-10 flex items-center text-paper" aria-hidden="true">
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
      {/* display:none (not unmount) keeps each tab's own form state intact while switching. */}
      {tabs.map((tab) => (
        <div key={tab.id} style={{ display: active === tab.id ? "block" : "none" }}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
