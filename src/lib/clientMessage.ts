import { resolveClientMessageTemplate } from "./stages";

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
}): string {
  const template = resolveClientMessageTemplate(params.stageKey, params.savedTemplate);
  const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
  const hoursRange = [hhmm(params.eventStartTime), hhmm(params.eventEndTime)].filter(Boolean).join("–");
  const currency = (n: number) => `₪${n.toLocaleString("he-IL")}`;
  let text = template
    .split("{{שם}}").join(params.clientName)
    .split("{{שלב}}").join(params.stageLabel)
    .split("{{תאריך}}").join(new Date(params.eventDateIso).toLocaleDateString("he-IL"))
    .split("{{מיקום}}").join(params.eventLocation ?? "")
    .split("{{חבילה}}").join(params.packageLabelText)
    .split("{{שעות}}").join(hoursRange)
    .split("{{צילומי_משפחה}}").join(hhmm(params.arrivalTime))
    // {{שעת_הגעה}} was this token's original name — kept working here so any already-saved
    // template using the old spelling doesn't silently start showing a literal "{{שעת_הגעה}}"
    // in sent messages after the rename.
    .split("{{שעת_הגעה}}").join(hhmm(params.arrivalTime))
    .split("{{מקדמה}}").join(params.depositAmount != null ? currency(params.depositAmount) : "")
    .split("{{יתרה}}").join(params.balanceAmount != null ? currency(params.balanceAmount) : "")
    .split("קישור:").join(`קישור: ${params.linkUrl}`);
  if (params.whatsappSignature?.trim()) text += `\n\n${params.whatsappSignature.trim()}`;
  return text;
}
