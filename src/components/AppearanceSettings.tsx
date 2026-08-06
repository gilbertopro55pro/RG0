"use client";

import { useEffect, useState } from "react";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

export default function AppearanceSettings() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const darkOn = theme === "dark";

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-wide">מראה כהה</div>
          <div className="text-xs text-ink-soft mt-0.5">
            {darkOn ? "מצב כהה פעיל" : "מצב בהיר פעיל"}
          </div>
        </div>
        <button
          onClick={toggleTheme}
          role="switch"
          aria-checked={darkOn}
          aria-label="הפעלת מראה כהה"
          className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
          style={{
            background: darkOn ? "var(--color-amber-deep)" : "var(--color-line)",
            justifyContent: darkOn ? "flex-start" : "flex-end",
          }}
        >
          <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
        </button>
      </div>
    </div>
  );
}
