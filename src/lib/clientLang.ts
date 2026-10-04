import { ADMIN_EMAIL } from "@/lib/admin";
import { isLang, type Lang } from "@/i18n/config";

// UI languages, phase 2 (2026-10-04): the language of the pages a client sees (quote, contract,
// portal, gallery, chat). Comes from leads.client_lang / events.client_lang (migration 0150), or
// from the browser in the chat. Admin account only for now: every other photographer's clients
// always get Hebrew, whatever is stored.
export function clientLangFor(photographerEmail: string | null | undefined, stored: unknown): Lang {
  if (photographerEmail !== ADMIN_EMAIL) return "he";
  return isLang(stored) ? stored : "he";
}

// Whether this photographer can choose a client language (the picker in the quote builder, lead and
// event screens). Same gate as clientLangFor.
export function canChooseClientLang(photographerEmail: string | null | undefined): boolean {
  return photographerEmail === ADMIN_EMAIL;
}

// First supported language in an Accept-Language header ("ru-RU,ru;q=0.9,en;q=0.8" → "ru"), for
// the chat, where there is no lead yet. Hebrew when none matches.
export function langFromAcceptLanguage(header: string | null | undefined): Lang {
  if (!header) return "he";
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { base } of tags) {
    if (base === "iw") return "he";
    if (isLang(base)) return base;
  }
  return "he";
}
