import {
  CLIENT_MESSAGE_LINK_MARKER,
  PACKAGE_LABELS,
  STAGE_LABELS,
  STAGE_NOTIFY_CLIENT,
  STAGE_NOTIFY_CLIENT_I18N,
  resolveClientMessageTemplate,
  type StageKey,
} from "./stages";
import { dateLocale, type Lang } from "@/i18n/config";
// Only the common area (stage and package labels), not the whole dictionary: this file is bundled
// into client components (EventDetailView, NewEventModal).
import common from "@/i18n/dict/common";
import { makeT } from "@/i18n/translate";

// Where a stage's template is saved for a client language (UI languages phase 3, no migration):
// Hebrew keeps the plain stage key, so nothing existing changes; English/Russian versions live
// under "<stageKey>@en" / "<stageKey>@ru" in the same client_message_templates table.
export function clientTemplateKey(stageKey: string, lang: Lang): string {
  return lang === "he" ? stageKey : `${stageKey}@${lang}`;
}

// True for an English/Russian row ("…@en" / "…@ru"), which is never a stage of its own.
export function isLangTemplateKey(stageKey: string): boolean {
  return /@(en|ru)$/.test(stageKey);
}

const PACKAGE_LABEL_VALUES = new Set<string>([...Object.values(PACKAGE_LABELS), "חבילה מותאמת אישית"]);

// The short "stage ready" notice sent with a file link (the album-design upload). Hebrew: the text
// the server returned, exactly as before.
export function buildStageNoticeText(params: {
  stageKey: StageKey;
  serverText: string;
  clientName: string;
  url: string;
  lang?: Lang;
}): string {
  const lang = params.lang ?? "he";
  if (lang === "he") return `שלום ${params.clientName},\n${params.serverText} ✓\n${params.url}`;
  const strings = STAGE_NOTIFY_CLIENT_I18N[lang];
  const text = strings[params.stageKey] ?? STAGE_NOTIFY_CLIENT[params.stageKey] ?? params.serverText;
  return `${strings.greeting.replace("{name}", params.clientName)}\n${text} ✓\n${params.url}`;
}

// The single source of truth for "what text does a client-update WhatsApp message actually
// contain" — every place in the app that sends one (the manual "שליחת עדכון" button, the
// automatic stage-complete notification, the new-event booking-confirmation message) resolves
// the photographer's own saved template (Settings → הודעות ללקוח/ה) and substitutes the exact
// same tokens through this one function, instead of each building its own divergent text.
export function buildClientMessageText(params: {
  stageKey: string;
  stageLabel: string;
  savedTemplate: string | undefined;
  clientName: string;
  eventDateIso: string;
  eventLocation: string | null;
  packageLabelText: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  arrivalTime: string | null;
  depositAmount: number | null;
  balanceAmount: number | null;
  // Whichever link is actually relevant to the client at this stage — the event's own gallery
  // (once published and not archived) if one exists, otherwise the client portal — resolved by
  // the caller (see EventDetailView.tsx's buildClientUpdateMessage) before reaching this function.
  linkUrl: string;
  whatsappSignature: string | null;
  // The client's language (events.client_lang through clientLangFor, resolved on the server).
  // Default Hebrew = exactly the text this always produced. `savedTemplate` must be the saved row
  // for this same language (clientTemplateKey).
  lang?: Lang;
}): string {
  const lang = params.lang ?? "he";
  const template = resolveClientMessageTemplate(params.stageKey, params.savedTemplate, lang);
  const t = makeT(lang === "he" ? {} : common[lang]);
  const locale = dateLocale(lang);
  // Standard stage/package names are translated; a custom stage or package name stays as typed.
  const stageLabel =
    lang !== "he" && params.stageKey in STAGE_LABELS ? t(STAGE_LABELS[params.stageKey as StageKey]) : params.stageLabel;
  const packageText = lang !== "he" && PACKAGE_LABEL_VALUES.has(params.packageLabelText) ? t(params.packageLabelText) : params.packageLabelText;
  const marker = CLIENT_MESSAGE_LINK_MARKER[lang];
  const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
  const hoursRange = [hhmm(params.eventStartTime), hhmm(params.eventEndTime)].filter(Boolean).join("–");
  const currency = (n: number) => `₪${n.toLocaleString(locale)}`;
  let text = template
    .split("{{שם}}").join(params.clientName)
    .split("{{שלב}}").join(stageLabel)
    .split("{{תאריך}}").join(new Date(params.eventDateIso).toLocaleDateString(locale))
    .split("{{מיקום}}").join(params.eventLocation ?? "")
    .split("{{חבילה}}").join(packageText)
    .split("{{שעות}}").join(hoursRange)
    .split("{{צילומי_משפחה}}").join(hhmm(params.arrivalTime))
    // {{שעת_הגעה}} was this token's original name — kept working here so any already-saved
    // template using the old spelling doesn't silently start showing a literal "{{שעת_הגעה}}"
    // in sent messages after the rename.
    .split("{{שעת_הגעה}}").join(hhmm(params.arrivalTime))
    .split("{{מקדמה}}").join(params.depositAmount != null ? currency(params.depositAmount) : "")
    .split("{{יתרה}}").join(params.balanceAmount != null ? currency(params.balanceAmount) : "")
    .split(marker).join(`${marker} ${params.linkUrl}`);
  if (params.whatsappSignature?.trim()) text += `\n\n${params.whatsappSignature.trim()}`;
  return text;
}
