"use client";

import { useState } from "react";
import { GALLERY_EXPIRY_OPTIONS } from "@/lib/stages";

const NO_FOLDER_KEY = "none";
// One specific account's own wording, requested verbatim — every other photographer gets a
// generic message instead, signed with their own name rather than a hardcoded one.
const OWNER_ACCOUNT_EMAIL = "gilbertopro_admin@gmail.com";

type GalleryFolderOption = { id: string; name: string };

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
  onClose,
}: {
  accessToken: string;
  folders: GalleryFolderOption[];
  hasUnfoldered: boolean;
  clientName: string;
  photographerName: string;
  photographerEmail: string;
  expiryDays: 7 | 14 | 30 | 90 | 180 | 365 | null;
  onClose: () => void;
}) {
  const allShareOptionKeys = [...folders.map((f) => f.id), ...(hasUnfoldered ? [NO_FOLDER_KEY] : [])];

  const [shareView, setShareView] = useState<"main" | "qr">("main");
  const [shareSelectedFolders, setShareSelectedFolders] = useState<Set<string>>(new Set(allShareOptionKeys));
  const [shareQuality, setShareQuality] = useState<"full" | "web">("full");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const toggleShareFolder = (key: string) => {
    setShareSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showFolderPicker = folders.length > 0;
  const shareDisabled = showFolderPicker && shareSelectedFolders.size === 0;

  const buildShareUrl = () => {
    const base = `${window.location.origin}/gallery/${accessToken}`;
    const params = new URLSearchParams();
    if (showFolderPicker) {
      const allSelected = allShareOptionKeys.every((k) => shareSelectedFolders.has(k));
      if (!allSelected) params.set("folders", [...shareSelectedFolders].join(","));
    }
    if (shareQuality === "web") params.set("quality", "web");
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const buildShareMessage = (url: string) => {
    const expiryLabel = expiryDays ? GALLERY_EXPIRY_OPTIONS.find((o) => o.value === expiryDays)?.label : null;
    const expiryClause = expiryLabel ? `הקישור בתוקף ל-${expiryLabel}, ` : "";
    if (photographerEmail === OWNER_ACCOUNT_EMAIL) {
      return `היי,\nהיה אירוע מעולה, תודה על הזכות לצלם לכם, שנפגש רק בשמחות 🙏🏼😊\nקישור לגלריית התמונות: ${url}\n\n${expiryClause}ניתן להוריד את התמונות, לשתף ולא לשכוח לתייג 😁\n${photographerName || "רועי גלברט"} - צילום אירועים`;
    }
    const namePrefix = clientName ? `${clientName}, ` : "";
    const signOff = photographerName ? `\n\n${photographerName} - צילום אירועים` : "";
    return `${namePrefix}הגלריה מהאירוע שלכם מוכנה לצפייה ובחירת תמונות 📸\nקישור לגלריית התמונות: ${url}\n\n${expiryClause}אפשר להוריד ולשתף את התמונות בכל שלב.${signOff}`;
  };

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
        await navigator.share({ title: "גלריה מהאירוע", text, url });
      } catch {
        // user canceled the native share sheet — nothing to do
      }
    } else {
      await navigator.clipboard.writeText(text);
      setShareStatus("הקישור הועתק ✓");
      setTimeout(() => setShareStatus(null), 2000);
    }
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.7)" }} onClick={onClose}>
        <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {shareView === "main" ? (
            <>
              <h2 className="text-lg font-bold font-display mb-4">שיתוף הגלריה</h2>

              {showFolderPicker && (
                <div className="mb-5">
                  <p className="text-xs text-ink-soft mb-2.5">אילו לשוניות לשתף?</p>
                  <div className="space-y-1.5">
                    {folders.map((folder) => (
                      <label key={folder.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                        <input type="checkbox" checked={shareSelectedFolders.has(folder.id)} onChange={() => toggleShareFolder(folder.id)} />
                        {folder.name}
                      </label>
                    ))}
                    {hasUnfoldered && (
                      <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                        <input type="checkbox" checked={shareSelectedFolders.has(NO_FOLDER_KEY)} onChange={() => toggleShareFolder(NO_FOLDER_KEY)} />
                        כללי (ללא לשונית)
                      </label>
                    )}
                  </div>
                  {shareDisabled && <p className="text-xs text-rose mt-2">יש לבחור לפחות לשונית אחת לשיתוף</p>}
                </div>
              )}

              <div className="mb-5">
                <p className="text-xs text-ink-soft mb-2.5">באיזו איכות לשתף?</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                    <input type="radio" name="share-quality" checked={shareQuality === "full"} onChange={() => setShareQuality("full")} />
                    איכות מלאה — הקבצים המקוריים
                  </label>
                  <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                    <input type="radio" name="share-quality" checked={shareQuality === "web"} onChange={() => setShareQuality("web")} />
                    איכות מותאמת לרשת — קובץ קטן יותר (עד כ-3MB לתמונה)
                  </label>
                </div>
              </div>

              <div className="space-y-2.5">
                <button onClick={shareViaWhatsapp} disabled={shareDisabled} className="w-full rounded-lg py-3 text-sm font-semibold bg-sage-bg text-sage disabled:opacity-40">
                  וואטסאפ
                </button>
                <button onClick={shareViaQr} disabled={shareDisabled} className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-40">
                  קוד QR
                </button>
                <button onClick={shareViaOther} disabled={shareDisabled} className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-40">
                  אחר
                </button>
              </div>
              <button onClick={onClose} className="w-full text-center mt-4 text-xs text-ink-soft">
                ביטול
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold font-display mb-4">קוד QR לגלריה</h2>
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="קוד QR לגלריה" className="w-full rounded-2xl mb-4" />
              )}
              <div className="flex gap-2">
                <button onClick={() => setShareView("main")} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft">
                  חזרה
                </button>
                <button onClick={onClose} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                  סגירה
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
