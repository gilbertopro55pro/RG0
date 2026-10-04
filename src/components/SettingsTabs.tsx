"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CURRENT_VERSION } from "@/lib/changelog";

export default function SettingsTabs({
  tabs,
  initialTab,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
  // ?tab=<id> on /settings opens that tab (e.g. the new-lead popup's link to notifications).
  initialTab?: string;
}) {
  const [active, setActive] = useState(tabs.some((t) => t.id === initialTab) ? initialTab : tabs[0]?.id);

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
      <select
        value={active}
        onChange={(e) => setActive(e.target.value)}
        className="w-full rounded-xl px-3.5 py-3 text-sm font-semibold border border-line bg-white mb-5"
      >
        {tabs.map((tab) => (
          <option key={tab.id} value={tab.id}>
            {tab.label}
          </option>
        ))}
      </select>
      {/* display:none (not unmount) keeps each tab's own form state intact while switching. */}
      {tabs.map((tab) => (
        <div key={tab.id} style={{ display: active === tab.id ? "block" : "none" }}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
