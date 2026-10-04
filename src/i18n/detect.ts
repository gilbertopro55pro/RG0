import type { Lang } from "@/i18n/config";

// The language a chat message is written in, by script: Hebrew letters → he, Cyrillic → ru, Latin →
// en. Null when the message doesn't say (digits, emoji, "ok"), so the conversation keeps its language.
// Latin needs more letters to move a Hebrew conversation to English: Hebrew speakers type "ok"/"bye"
// in Latin, while Hebrew or Cyrillic letters are unambiguous.
export function detectTextLang(text: string, current: Lang): Lang | null {
  const he = (text.match(/[א-ת]/g) ?? []).length;
  const ru = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = he + ru + en;
  if (total === 0) return null;
  if (he / total > 0.5 && he >= 2) return "he";
  if (ru / total > 0.5 && ru >= 2) return "ru";
  if (en / total > 0.5 && en >= (current === "en" ? 2 : 6)) return "en";
  return null;
}
