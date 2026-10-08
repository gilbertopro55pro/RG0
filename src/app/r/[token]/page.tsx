import type { Metadata } from "next";
import { loadReceiptLink } from "@/lib/receiptLinks";
import { getSignedDownloadUrl } from "@/lib/storage";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";
import ClientLangScope from "@/i18n/ClientLangScope";
import { dateLocale } from "@/i18n/config";
import { makeT } from "@/i18n/translate";
import { messagesFor } from "@/i18n/dict";

// The page behind a receipt's short link (owner, 2026-10-08): myframeflow.com/r/<token>, sent to
// the client on WhatsApp. The studio's logo and name, a greeting with the amount, and buttons to
// view or download the PDF (./file). Its metadata gives WhatsApp a card with the studio's logo
// (./og), instead of a bare link. In the client's language; public, the token is the access.

// Same palette as the quote page and PDF.
const NAVY = "#0b1220";
const GOLD = "#8f6f2f";
const GOLD_DEEP = "#7c5f27";
const GOLD_LIGHT = "#c9a15a";
const PAPER = "#eef1f6";
const HAIRLINE = "#dce1ea";
const INK_SOFT = "#56607a";
const ON_NAVY_SOFT = "#aeb8cc";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const link = await loadReceiptLink(token);
  const t = makeT(messagesFor(link?.lang ?? "he"));
  if (!link) return { title: t("קבלה"), robots: { index: false, follow: false } };
  const title = link.studio.name ? `${link.studio.name} | ${t("קבלה על תשלום")}` : t("קבלה על תשלום");
  const description = t("לצפייה בקבלה ולהורדה שלה");
  const image = { url: `/r/${token}/og`, width: 1200, height: 630 };
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, siteName: link.studio.name || undefined, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

function ReceiptIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2.5h12v19l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M9 7.5h6M9 11h6M9 14.5h3.5" />
    </svg>
  );
}

export default async function ReceiptPage({ params }: Params) {
  const { token } = await params;
  const link = await loadReceiptLink(token);
  const lang = link?.lang ?? "he";
  const t = makeT(messagesFor(lang));

  if (!link) {
    return (
      <ClientLangScope lang={lang}>
        <div className="min-h-screen flex items-center justify-center px-4" style={{ background: PAPER }}>
          <p className="text-sm" style={{ color: INK_SOFT }}>
            {t("הקבלה לא נמצאה.")}
          </p>
        </div>
      </ClientLangScope>
    );
  }

  const { studio } = link;
  const logoUrl = studio.logoPath ? await getSignedDownloadUrl("logos", studio.logoPath, 60 * 60 * 24) : null;
  const waLink = studio.phone
    ? `https://wa.me/${normalizeIsraeliPhone(studio.phone)}?text=${encodeURIComponent(t("היי, יש לי שאלה לגבי הקבלה"))}`
    : null;

  return (
    <ClientLangScope lang={lang}>
      <div className="min-h-screen" style={{ background: PAPER }}>
        <div className="max-w-[520px] mx-auto bg-white min-h-screen shadow-[0_0_40px_rgba(11,18,32,0.08)]">
          <header className="relative px-6 sm:px-8 pt-8 pb-14" style={{ background: NAVY, borderBottom: `3px solid ${GOLD}` }}>
            <div className="text-sm font-bold" style={{ color: GOLD_LIGHT }}>
              {t("קבלה על תשלום")}
            </div>
            <div className="text-[26px] font-bold text-white leading-tight mt-1 font-display">{studio.name}</div>
            {studio.phone && (
              <div className="mt-2 text-[13px]" style={{ color: ON_NAVY_SOFT }}>
                <span dir="ltr">{studio.phone}</span>
              </div>
            )}
            {/* Logo on a gold ring, overlapping the header's bottom edge */}
            <div
              className="absolute end-6 sm:end-8 -bottom-12 h-24 w-24 rounded-full bg-white flex items-center justify-center overflow-hidden"
              style={{ border: `3px solid ${GOLD}` }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={studio.name} className="h-full w-full object-contain p-2" />
              ) : (
                <ReceiptIcon size={40} color={NAVY} />
              )}
            </div>
          </header>

          <main className="px-6 sm:px-8 pt-16 pb-10">
            <section className="rounded-xl p-5" style={{ background: PAPER, borderInlineStart: `4px solid ${GOLD}` }}>
              {link.customerName && (
                <div className="text-lg font-bold" style={{ color: NAVY }}>
                  {t("שלום {name},", { name: link.customerName })}
                </div>
              )}
              <p className="mt-1 text-[15px]" style={{ color: INK_SOFT }}>
                {t("מצורפת קבלה על התשלום.")}
              </p>
              {link.amount != null && (
                <div className="mt-4">
                  <div className="text-xs" style={{ color: INK_SOFT }}>
                    {t("סכום התשלום")}
                  </div>
                  <div className="text-[32px] font-bold leading-tight" style={{ color: NAVY }}>
                    <span dir="ltr">₪{link.amount.toLocaleString(dateLocale(lang))}</span>
                  </div>
                </div>
              )}
            </section>

            <a
              href={`/r/${token}/file`}
              className="mt-6 flex h-[52px] items-center justify-center gap-2 rounded-xl text-[16px] font-bold text-white"
              style={{ background: NAVY }}
            >
              <ReceiptIcon size={20} color={GOLD_LIGHT} />
              {t("צפייה בקבלה")}
            </a>
            <a
              href={`/r/${token}/file?download=1`}
              className="mt-3 flex h-12 items-center justify-center gap-2 rounded-xl border bg-white text-[15px] font-semibold"
              style={{ borderColor: HAIRLINE, color: NAVY }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
              </svg>
              {t("הורדת הקבלה")}
            </a>

            <p className="mt-8 text-[15px] leading-relaxed" style={{ color: INK_SOFT }}>
              {t("תודה,")}
              <br />
              <span className="font-bold" style={{ color: NAVY }}>
                {studio.name}
              </span>
            </p>

            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold"
                style={{ color: GOLD_DEEP }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z" />
                </svg>
                {t("שאלה על הקבלה? שליחת הודעה בוואטסאפ")}
              </a>
            )}
          </main>
        </div>
      </div>
    </ClientLangScope>
  );
}
