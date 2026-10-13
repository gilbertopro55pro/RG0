import type { Lang } from "@/i18n/config";

// The shape of one "מה חדש" entry and how it reads in a language, apart from the history itself
// (lib/changelog.ts, ~270KB): client components get the version and the latest entry as props from
// the server, so the whole history never ships with every page (audit 2026-10-13).
export type ChangelogEntry = {
  version: string;
  date: string;
  // Hebrew, the source text (and the fallback for any language without a translation).
  changes: string[];
  // Translations for the photographer's screen language (Settings › מראה › שפת הממשק): same
  // order and length as `changes`. Missing → the Hebrew `changes` is shown.
  en?: string[];
  ru?: string[];
};

// The entry's lines in the viewer's UI language, falling back to Hebrew when the translation is
// missing or doesn't line up with the Hebrew list.
export function changesFor(entry: ChangelogEntry, lang: Lang): string[] {
  const tr = lang === "en" ? entry.en : lang === "ru" ? entry.ru : undefined;
  return tr && tr.length === entry.changes.length ? tr : entry.changes;
}
