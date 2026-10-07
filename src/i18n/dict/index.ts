import type { Lang } from "@/i18n/config";
import type { AreaDict, Messages } from "@/i18n/types";
import common from "@/i18n/dict/common";
import home from "@/i18n/dict/home";
import galleries from "@/i18n/dict/galleries";
import album from "@/i18n/dict/album";
import leads from "@/i18n/dict/leads";
import settings from "@/i18n/dict/settings";
import settingsAdmin from "@/i18n/dict/settingsAdmin";
import clientChat from "@/i18n/dict/clientChat";
import clientQuote from "@/i18n/dict/clientQuote";
import clientPortal from "@/i18n/dict/clientPortal";
import clientGallery from "@/i18n/dict/clientGallery";
import clientMessages from "@/i18n/dict/clientMessages";
import clientQuoteSend from "@/i18n/dict/clientQuoteSend";
import clientEmails from "@/i18n/dict/clientEmails";
import landing from "@/i18n/dict/landing";
import auth from "@/i18n/dict/auth";
import photographerNotify from "@/i18n/dict/photographerNotify";
import whatsNew from "@/i18n/dict/whatsNew";
import billingNotify from "@/i18n/dict/billingNotify";
import reels from "@/i18n/dict/reels";
import reelsTransitions from "@/i18n/dict/reelsTransitions";

// One dictionary per area of the app, merged here (common first, so an area can override).
const AREAS: AreaDict[] = [
  common, home, galleries, album, leads, settings, settingsAdmin,
  clientChat, clientQuote, clientPortal, clientGallery,
  clientMessages, clientQuoteSend, clientEmails,
  landing, auth, photographerNotify, whatsNew, billingNotify, reels, reelsTransitions,
];

const cache: Partial<Record<Lang, Messages>> = {};

export function messagesFor(lang: Lang): Messages {
  if (lang === "he") return {};
  return (cache[lang] ??= Object.assign({}, ...AREAS.map((a) => a[lang])));
}
