"use client";

import { useState, type ReactNode } from "react";
import { BTN_PRESS } from "@/lib/viewTransition";

export default function SettingsTabs({
  tabs,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${BTN_PRESS}`}
            style={{
              background: active === tab.id ? "var(--color-ink)" : "var(--color-chip)",
              color: active === tab.id ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            {tab.label}
          </button>
        ))}
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
