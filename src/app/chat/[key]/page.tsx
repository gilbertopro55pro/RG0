import type { Metadata } from "next";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { resolveChatPhotographer } from "@/lib/intakeChatAccess";
import { getSignedDownloadUrl } from "@/lib/storage";
import IntakeChat from "@/components/IntakeChat";
import ClientLangScope from "@/i18n/ClientLangScope";
import { clientLangFor, langFromAcceptLanguage } from "@/lib/clientLang";
import { isLang, type Lang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// No lead yet, so the page language comes from the browser, or from ?lang=he|en|ru (an ad in a
// specific language). Admin account only for now (clientLangFor): everyone else gets Hebrew.
async function chatLang(email: string | null | undefined, searchParams: SearchParams): Promise<Lang> {
  const q = (await searchParams).lang;
  const fromUrl = typeof q === "string" && isLang(q) ? q : null;
  return clientLangFor(email, fromUrl ?? langFromAcceptLanguage((await headers()).get("accept-language")));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: SearchParams }): Promise<Metadata> {
  const { key } = await params;
  const p = await resolveChatPhotographer(createServiceRoleClient(), key);
  if (!p) return { title: "פנייה", robots: { index: false } };
  const t = makeT(messagesFor(await chatLang(p.email, searchParams)));
  // The preview card WhatsApp/Instagram show when the link is shared (one image for every studio).
  // The studio's own title stays as the photographer wrote it.
  const title = `${p.intake_chat_title?.trim() || p.name} | ${t("בדיקת תאריך ומענה מיידי")}`;
  const description = t("כתבו עכשיו ותקבלו תשובה תוך שניות: בודקים אם התאריך פנוי ואוספים את פרטי האירוע להצעה אישית.");
  const images = [{ url: "/og/chat.png", width: 1200, height: 630, alt: t("בדיקת תאריך בצ'אט, תשובה תוך שניות") }];
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, siteName: p.intake_chat_title?.trim() || p.name, images, type: "website" },
    twitter: { card: "summary_large_image", title, description, images: ["/og/chat.png"] },
  };
}

// The intake assistant's public chat (עוזר פניות) — see lib/intakeAssistant.ts.
export default async function ChatPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: SearchParams }) {
  const { key } = await params;
  const p = await resolveChatPhotographer(createServiceRoleClient(), key);
  if (!p) {
    // No photographer to decide by: Hebrew, as before.
    return (
      <ClientLangScope lang="he">
        <div className="min-h-screen flex items-center justify-center bg-paper text-ink-soft px-4">
          <p className="text-sm">הדף לא נמצא.</p>
        </div>
      </ClientLangScope>
    );
  }
  const lang = await chatLang(p.email, searchParams);
  const logoUrl = p.logo_storage_path ? await getSignedDownloadUrl("logos", p.logo_storage_path, 60 * 60 * 24) : null;
  return (
    <ClientLangScope lang={lang}>
      <IntakeChat chatKey={key} studio={p.name} title={p.intake_chat_title?.trim() || p.name} logoUrl={logoUrl} replyHours={p.intake_bot_reply_hours} pixelId={p.meta_pixel_id ?? null} />
    </ClientLangScope>
  );
}
