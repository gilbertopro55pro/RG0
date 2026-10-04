// UI languages (phase 1, 2026-10-02: the photographer's screens, admin account only for now).
// The language is a per-device cookie set from Settings › תצוגה; Hebrew is the source and the
// default. Translations are keyed by the Hebrew text itself (src/i18n/translate.ts), so any string
// without a translation simply stays in Hebrew.
export const LANGS = ["he", "en", "ru"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_COOKIE = "ui_lang";

export const LANG_LABELS: Record<Lang, string> = { he: "עברית", en: "English", ru: "Русский" };

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

export function dirOf(lang: Lang): "rtl" | "ltr" {
  return lang === "he" ? "rtl" : "ltr";
}

// For toLocaleDateString / toLocaleTimeString / Intl.NumberFormat.
export function dateLocale(lang: Lang): string {
  return lang === "he" ? "he-IL" : lang === "ru" ? "ru-RU" : "en-GB";
}
