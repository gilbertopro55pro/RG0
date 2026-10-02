"use client";

import { useEffect, useState } from "react";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { useLang, useT } from "@/i18n/client";
import { LANGS, LANG_LABELS, type Lang } from "@/i18n/config";

// canChooseLanguage: the UI language picker (src/i18n), admin account only during phase 1.
export default function AppearanceSettings({ canChooseLanguage = false }: { canChooseLanguage?: boolean }) {
  const t = useT();
  const lang = useLang();
  const [theme, setThemeState] = useState<Theme>("light");
  const [langBusy, setLangBusy] = useState(false);
  const [langError, setLangError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setThemeState(getTheme()), 0);
    return () => clearTimeout(id);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const chooseLanguage = async (next: Lang) => {
    if (next === lang) return;
    setLangBusy(true);
    setLangError(null);
    const res = await fetch("/api/ui-language", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: next }) }).catch(() => null);
    if (!res?.ok) {
      setLangBusy(false);
      setLangError(t("החלפת השפה נכשלה. נסו שוב"));
      return;
    }
    // A full reload: the page direction (right-to-left / left-to-right) is set on <html>.
    window.location.reload();
  };

  const darkOn = theme === "dark";

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{t("מראה כהה")}</div>
            <div className="text-xs text-ink-soft mt-0.5">{darkOn ? t("מצב כהה פעיל") : t("מצב בהיר פעיל")}</div>
          </div>
          <button
            onClick={toggleTheme}
            role="switch"
            aria-checked={darkOn}
            aria-label={t("הפעלת מראה כהה")}
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

      {canChooseLanguage && (
        <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
          <div className="text-sm font-semibold">{t("שפת הממשק")}</div>
          <div className="text-xs text-ink-soft mt-0.5 mb-3">{t("השפה נשמרת במכשיר הזה. מסכי הלקוח, המיילים והמסמכים נשארים בעברית בשלב הזה.")}</div>
          <div className="grid grid-cols-3 gap-2">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                disabled={langBusy}
                onClick={() => void chooseLanguage(l)}
                className={`rounded-lg py-2 text-sm font-semibold border disabled:opacity-60 ${l === lang ? "bg-ink text-white border-ink" : "bg-white border-line text-ink"}`}
                lang={l}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
          {langError && <p className="text-xs text-rose mt-2">{langError}</p>}
        </div>
      )}
    </div>
  );
}
