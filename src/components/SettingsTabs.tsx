"use client";

import { useState, type ReactNode } from "react";

export default function SettingsTabs({
  tabs,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);

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
