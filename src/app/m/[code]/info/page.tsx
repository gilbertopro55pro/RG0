import type { Metadata } from "next";
import { cache } from "react";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { magnetGuestState } from "@/lib/magnetGuest";
import ClientLangScope from "@/i18n/ClientLangScope";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// The page a magnet's guest QR shows when there are no photos to open (../route.ts sends the scan
// here): the photos aren't up yet (the studio's logo and name, and its portfolio meanwhile), the
// gallery is no longer available, or the link isn't on. In the event's client language. Not indexed.

const load = cache(async (code: string) => magnetGuestState(createServiceRoleClient(), code));

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const state = await load(code);
  const t = makeT(messagesFor(state.lang));
  const studioName = state.kind === "soon" || state.kind === "unavailable" ? state.studio.name : "";
  const title = studioName || t("התמונות מהאירוע");
  const logo = (state.kind === "soon" || state.kind === "unavailable") && state.studio.logoPath ? `/m/${encodeURIComponent(code)}/logo` : null;
  return {
    title,
    robots: { index: false, follow: false },
    openGraph: { title, description: t("התמונות מהאירוע יעלו לכאן בקרוב"), images: logo ? [{ url: logo, width: 240, height: 240 }] : undefined },
    twitter: { card: "summary", title, images: logo ? [logo] : undefined },
  };
}

export default async function MagnetGuestInfoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const state = await load(code);
  const t = makeT(messagesFor(state.lang));
  const href = `/m/${encodeURIComponent(code)}`;

  if (state.kind === "inactive") {
    return (
      <ClientLangScope lang={state.lang}>
        <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
          <p className="text-sm text-ink-soft">{t("הקישור לא פעיל")}</p>
        </div>
      </ClientLangScope>
    );
  }

  // Reached by an old bookmark of this page after the photos went up.
  if (state.kind === "gallery") {
    return (
      <ClientLangScope lang={state.lang}>
        <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
          <a href={href} className="inline-flex items-center justify-center rounded-2xl px-5 py-3.5 text-sm font-semibold bg-ink text-white">
            {t("לצפייה בתמונות מהאירוע")}
          </a>
        </div>
      </ClientLangScope>
    );
  }

  const { studio } = state;
  return (
    <ClientLangScope lang={state.lang}>
      <div className="max-w-md mx-auto px-4 pt-14 pb-10 w-full text-center">
        {studio.logoPath && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${href}/logo`} alt="" width={96} height={96} className="mx-auto h-24 w-24 rounded-2xl object-contain bg-white border border-line shadow-card" />
        )}
        {studio.name && <div className={`text-lg font-bold font-display ${studio.logoPath ? "mt-4" : ""}`}>{studio.name}</div>}

        <div className="rounded-2xl p-5 mt-6 bg-card border border-line shadow-card">
          {state.kind === "soon" ? (
            <>
              <p className="text-base font-semibold">{t("התמונות מהאירוע יעלו לכאן בקרוב")}</p>
              <p className="text-xs text-ink-soft mt-2 leading-relaxed">{t("אפשר לסרוק שוב את הקוד שעל המגנט בעוד כמה ימים, והתמונות ייפתחו כאן.")}</p>
            </>
          ) : (
            <p className="text-sm font-semibold">{t("התמונות מהאירוע כבר לא זמינות כאן.")}</p>
          )}
        </div>

        {studio.portfolioSlug && (
          <a
            href={`/p/${encodeURIComponent(studio.portfolioSlug)}`}
            className="flex items-center justify-center gap-2 rounded-2xl p-3.5 mt-5 text-sm font-semibold bg-sage-bg text-sage"
          >
            {studio.name ? t("לתיק העבודות של {name}", { name: studio.name }) : t("לתיק העבודות")}
          </a>
        )}
      </div>
    </ClientLangScope>
  );
}
