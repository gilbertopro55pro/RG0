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
