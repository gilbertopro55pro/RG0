import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { resolveChatPhotographer } from "@/lib/intakeChatAccess";
import { getSignedDownloadUrl } from "@/lib/storage";
import IntakeChat from "@/components/IntakeChat";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const p = await resolveChatPhotographer(createServiceRoleClient(), key);
  if (!p) return { title: "פנייה", robots: { index: false } };
  // The preview card WhatsApp/Instagram show when the link is shared (one image for every studio).
  const title = `${p.name} | בדיקת תאריך ומענה מיידי`;
  const description = "כתבו עכשיו ותקבלו תשובה תוך שניות: בודקים אם התאריך פנוי ואוספים את פרטי האירוע להצעה אישית.";
  const images = [{ url: "/og/chat.png", width: 1200, height: 630, alt: "בדיקת תאריך בצ'אט, תשובה תוך שניות" }];
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, siteName: p.name, images, type: "website" },
    twitter: { card: "summary_large_image", title, description, images: ["/og/chat.png"] },
  };
}

// The intake assistant's public chat (עוזר פניות) — see lib/intakeAssistant.ts.
export default async function ChatPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await resolveChatPhotographer(createServiceRoleClient(), key);
  if (!p) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-ink-soft px-4">
        <p className="text-sm">הדף לא נמצא.</p>
      </div>
    );
  }
  const logoUrl = p.logo_storage_path ? await getSignedDownloadUrl("logos", p.logo_storage_path, 60 * 60 * 24) : null;
  return <IntakeChat chatKey={key} studio={p.name} logoUrl={logoUrl} replyHours={p.intake_bot_reply_hours} />;
}
