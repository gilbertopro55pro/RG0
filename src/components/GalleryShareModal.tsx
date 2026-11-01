"use client";

import { useState } from "react";
import { GALLERY_EXPIRY_OPTIONS } from "@/lib/stages";
import { useT } from "@/i18n/client";
import type { Lang } from "@/i18n/config";
import clientEmails from "@/i18n/dict/clientEmails";
import clientMessages from "@/i18n/dict/clientMessages";
import { makeT } from "@/i18n/translate";
import { galleryShareSearch, shortClientUrl } from "@/lib/shortLinks";
import { formatClientMessage } from "@/lib/clientMessageFormat";
import TabPicker from "@/components/galleryManage/TabPicker";

const NO_FOLDER_KEY = "none";
// One specific account's own wording (the owner's, now in the fixed client-message shape) — every
// other photographer gets a generic message instead, signed with their own signature or name.
const OWNER_ACCOUNT_EMAIL = "gilbertopro_admin@gmail.com";

type ExpiryDays = 7 | 14 | 30 | 90 | 180 | 365;

// "The link is valid for …" in a sentence (the Hebrew uses GALLERY_EXPIRY_OPTIONS' own labels).
const EXPIRY_PERIOD: Record<"en" | "ru", Record<ExpiryDays, string>> = {
  en: { 7: "1 week", 14: "14 days", 30: "1 month", 90: "3 months", 180: "6 months", 365: "1 year" },
  ru: { 7: "неделю", 14: "14 дней", 30: "месяц", 90: "3 месяца", 180: "6 месяцев", 365: "год" },
};

// Only these areas' dictionaries (not messagesFor's merged one), so the client bundle stays small.
function clientT(lang: Lang) {
  return makeT(lang === "he" ? {} : { ...clientEmails[lang], ...clientMessages[lang] });
}

const OWNER_NAME_FALLBACK: Record<Lang, string> = { he: "רועי גלברט", en: "Roei Gelbert", ru: "Рои Гелберт" };

// The WhatsApp / share-sheet text the photographer sends a client with the gallery link — shared
// by this modal and GalleryManageView (share button + "gallery published" update), in the client's
// language (UI languages phase 3). The fixed client-message shape (owner, 2026-11-01,
// lib/clientMessageFormat.ts): "שלום {name},", the body, the "קישור:" line, a blank line, then the
// photographer's WhatsApp signature, or their name without one (never "<name> - צילום אירועים",
// which doubled up when the name already says it).
export function buildGalleryShareMessage({
  url,
  clientName,
  photographerName,
  photographerEmail,
  expiryDays,
  lang = "he",
  signature = null,
}: {
  url: string;
  clientName: string;
  photographerName: string;
  photographerEmail: string;
  expiryDays: ExpiryDays | null;
  lang?: Lang;
  signature?: string | null;
}): string {
  const t = clientT(lang);
  // The full option list, not the tier-filtered one — a gallery can carry a value from a plan
  // the photographer no longer has (e.g. downgraded from פרו+ after picking 6 months), and it
  // should still label correctly rather than silently show nothing.
  const heLabel = expiryDays ? GALLERY_EXPIRY_OPTIONS.find((o) => o.value === expiryDays)?.label : null;
  const period = heLabel && expiryDays ? (lang === "he" ? heLabel : EXPIRY_PERIOD[lang][expiryDays]) : null;
  const expiry = period ? ` ${t("הגלריה זמינה למשך {period}.", { period })}` : "";
  // One specific account's own wording (the owner's), in the same shape.
  const owner = photographerEmail === OWNER_ACCOUNT_EMAIL;
  const body = owner
    ? t("היה אירוע מעולה, תודה על הזכות לצלם לכם. שנפגש רק בשמחות 🙏🏼\nאפשר להוריד את התמונות ולשתף, ולא לשכוח לתייג.")
    : t("הגלריה מהאירוע שלכם מוכנה לצפייה 📸\nאפשר ליהנות מהתמונות, לבחור את האהובות עליכם, להוריד ולשתף.");
  return formatClientMessage({
    lang,
    name: clientName,
    body: body + expiry,
    link: url,
    signature,
    senderName: photographerName || (owner ? OWNER_NAME_FALLBACK[lang] : null),
  });
}

// "{n} new photos" update, sent to a published gallery's client after more photos were uploaded.
export function buildGalleryPhotosUploadedMessage({
  url,
  clientName,
  count,
  lang = "he",
  signature = null,
  senderName = null,
}: {
  url: string;
  clientName: string;
  count: number;
  lang?: Lang;
  signature?: string | null;
  senderName?: string | null;
}): string {
  const t = clientT(lang);
  return formatClientMessage({
    lang,
    name: clientName,
    body: t("רצינו לעדכן שנוספו לגלריה שלכם {count} תמונות חדשות 📸", { count }),
    link: url,
    signature,
    senderName,
  });
}

// A finished album export shared with the client. `label` is the Hebrew export label
// ("ייצוא PDF" / "ייצוא JPG" / "ייצוא PSD" / "ייצוא הקבצים"); the message names only the format.
// The export task carries the client's name and the photographer's signature (or name) from the
// gallery page; an export started elsewhere (the home screen's quick access) opens with "שלום,".
export function buildExportReadyMessage({
  label,
  url,
  lang = "he",
  clientName = null,
  signature = null,
  senderName = null,
}: {
  label: string;
  url: string;
  lang?: Lang;
  clientName?: string | null;
  signature?: string | null;
  senderName?: string | null;
}): string {
  const t = clientT(lang);
  const format = label.match(/\b(PDF|JPG|PSD)\b/)?.[1];
  return formatClientMessage({
    lang,
    name: clientName,
    body: format ? t("האלבום שלכם מוכן להורדה בפורמט {format}.", { format }) : t("קבצי האלבום שלכם מוכנים להורדה."),
    link: url,
    signature,
    senderName,
  });
}

// The native share sheet's title.
export function galleryShareTitle(lang: Lang = "he"): string {
  return clientT(lang)("גלריה מהאירוע");
}

type GalleryFolderOption = { id: string; name: string; sort_order: number; parent_id?: string | null };

// Shared by GalleryManageView (sharing from inside a gallery) and GalleriesListView's double-click
// quick-actions menu (sharing without opening the gallery) — a single implementation so the
// folder/quality picker, share-link construction and WhatsApp/QR/native-share buttons never drift
// out of sync between the two entry points.
export default function GalleryShareModal({
  accessToken,
  folders,
  hasUnfoldered,
  clientName,
  photographerName,
  photographerEmail,
  expiryDays,
  clientLang = "he",
  signature = null,
  onClose,
}: {
  accessToken: string;
  folders: GalleryFolderOption[];
  hasUnfoldered: boolean;
  clientName: string;
  photographerName: string;
  photographerEmail: string;
  expiryDays: 7 | 14 | 30 | 90 | 180 | 365 | null;
  // The client's language (UI languages phase 3), computed on the server with clientLangFor —
  // "he" for every non-admin account, so their share text is unchanged.
  clientLang?: Lang;
  // The photographer's WhatsApp signature; the message is signed with the name without one.
  signature?: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const allShareOptionKeys = [...folders.map((f) => f.id), ...(hasUnfoldered ? [NO_FOLDER_KEY] : [])];

  const [shareView, setShareView] = useState<"main" | "qr">("main");
  const [shareSelectedFolders, setShareSelectedFolders] = useState<Set<string>>(new Set(allShareOptionKeys));
  const [shareQuality, setShareQuality] = useState<"full" | "web">("full");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const showFolderPicker = folders.length > 0;
  const shareDisabled = showFolderPicker && shareSelectedFolders.size === 0;

  const buildShareUrl = () =>
    shortClientUrl(window.location.origin, "gallery", accessToken, galleryShareSearch(showFolderPicker ? allShareOptionKeys : null, shareSelectedFolders, shareQuality));

  const buildShareMessage = (url: string) =>
    buildGalleryShareMessage({ url, clientName, photographerName, photographerEmail, expiryDays, lang: clientLang, signature });

  const shareViaWhatsapp = () => {
    const text = buildShareMessage(buildShareUrl());
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    onClose();
  };

  const shareViaQr = async () => {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(buildShareUrl(), { width: 280, margin: 1 });
    setQrDataUrl(dataUrl);
    setShareView("qr");
  };

  const shareViaOther = async () => {
    const url = buildShareUrl();
    const text = buildShareMessage(url);
    if (navigator.share) {
      try {
        await navigator.share({ title: galleryShareTitle(clientLang), text, url });
      } catch {
        // user canceled the native share sheet — nothing to do
      }
    } else {
      await navigator.clipboard.writeText(text);
      setShareStatus(t("הקישור הועתק ✓"));
      setTimeout(() => setShareStatus(null), 2000);
    }
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.7)" }} onClick={onClose}>
        <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {shareView === "main" ? (
            <>
              <h2 className="text-lg font-bold font-display mb-4">{t("שיתוף הגלריה")}</h2>

              {showFolderPicker && (
                <div className="mb-5">
                  <p className="text-xs text-ink-soft mb-2.5">{t("אילו לשוניות לשתף?")}</p>
                  <TabPicker folders={folders} selected={shareSelectedFolders} onChange={setShareSelectedFolders} noFolderKey={NO_FOLDER_KEY} hasUnfoldered={hasUnfoldered} />
                  {shareDisabled && <p className="text-xs text-rose mt-2">{t("יש לבחור לפחות לשונית אחת לשיתוף")}</p>}
                </div>
              )}

              <div className="mb-5">
                <p className="text-xs text-ink-soft mb-2.5">{t("באיזו איכות לשתף?")}</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                    <input type="radio" name="share-quality" checked={shareQuality === "full"} onChange={() => setShareQuality("full")} />
                    {t("איכות מלאה (הקבצים המקוריים)")}
                  </label>
                  <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                    <input type="radio" name="share-quality" checked={shareQuality === "web"} onChange={() => setShareQuality("web")} />
                    {t("איכות מותאמת לרשת, קובץ קטן יותר (עד כ-3MB לתמונה)")}
                  </label>
                </div>
              </div>

              <div className="space-y-2.5">
                <button onClick={shareViaWhatsapp} disabled={shareDisabled} className="w-full rounded-lg py-3 text-sm font-semibold bg-sage-bg text-sage disabled:opacity-40">
                  {t("וואטסאפ")}
                </button>
                <button onClick={shareViaQr} disabled={shareDisabled} className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-40">
                  {t("קוד QR")}
                </button>
                <button onClick={shareViaOther} disabled={shareDisabled} className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-40">
                  {t("אחר")}
                </button>
              </div>
              <button onClick={onClose} className="w-full text-center mt-4 text-xs text-ink-soft">
                {t("ביטול")}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold font-display mb-4">{t("קוד QR לגלריה")}</h2>
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt={t("קוד QR לגלריה")} className="w-full rounded-2xl mb-4" />
              )}
              <div className="flex gap-2">
                <button onClick={() => setShareView("main")} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft">
                  {t("חזרה")}
                </button>
                <button onClick={onClose} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                  {t("סגירה")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {shareStatus && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] rounded-full px-4 py-2 text-xs font-semibold bg-ink text-white shadow-sheet">
          {shareStatus}
        </div>
      )}
    </>
  );
}
