import { isLang, type Lang } from "@/i18n/config";

// UI languages, phases 2–3 (2026-10-04): the language of the pages a client sees and of the messages
// sent to them (quote, contract, portal, gallery, chat, WhatsApp, emails, PDF). Comes from
// leads.client_lang / events.client_lang (migration 0150), or from the language the client writes
// in the chat. Admin-only at first, open to every account since 2026-10-04 (owner: "תשחרר").
// The email parameter is kept so a gate can come back without touching every call site.
export function clientLangFor(_photographerEmail: string | null | undefined, stored: unknown): Lang {
  return isLang(stored) ? stored : "he";
}

// Whether this photographer can choose a client language (the picker in the quote builder, lead and
// event screens, per-language message templates). Every account since 2026-10-04.
export function canChooseClientLang(_photographerEmail: string | null | undefined): boolean {
  return true;
}
