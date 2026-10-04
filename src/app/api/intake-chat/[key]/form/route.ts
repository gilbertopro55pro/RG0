import { NextResponse, type NextRequest } from "next/server";
import { sendPushToPhotographer } from "@/lib/push";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";
import { resolveChatPhotographer } from "@/lib/intakeChatAccess";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { cleanSource } from "@/lib/leadSource";
import { canChooseClientLang, photographerLang } from "@/lib/clientLang";
import { isLang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

export const runtime = "nodejs";

// The plain inquiry form behind the chat page — used when the assistant isn't available for this
// photographer (off, plan, or this month's cap). No model call; straight into leads.
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { allowed } = await checkRateLimit(`intake-form:${clientIpFrom(request)}`, { maxRequests: 30, windowSeconds: 3600 });
  if (!allowed) return NextResponse.json({ error: "יותר מדי פניות. נסו שוב מאוחר יותר" }, { status: 429 });

  const body: { name?: string; phone?: string; date?: string; eventType?: string; notes?: string; src?: string; lang?: string } = await request.json().catch(() => ({}));
  const name = (body.name ?? "").trim().slice(0, 100);
  const phone = (body.phone ?? "").trim().slice(0, 30);
  if (!name || !phone) return NextResponse.json({ error: "צריך שם וטלפון" }, { status: 400 });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") ? body.date! : null;

  const supabase = createServiceRoleClient();
  const p = await resolveChatPhotographer(supabase, key);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  const eventType = (body.eventType ?? "").trim().slice(0, 60) || null;
  const notes = (body.notes ?? "").trim().slice(0, 1000) || null;
  const { error } = await supabase.from("leads").insert({
    photographer_id: p.id,
    name,
    phone,
    event_date_interest: date,
    event_type_name: eventType,
    notes,
    source: "form",
    referral_source: cleanSource(body.src),
    details: { clientName: name, phone, eventDate: date ?? undefined, eventType: eventType ?? undefined, wishes: notes ?? undefined },
    needs_details: true,
    // The chat page's language (UI languages phase 2): admin only, for now; otherwise left null.
    ...(canChooseClientLang(p.email) && isLang(body.lang) ? { client_lang: body.lang } : {}),
  });
  if (error) return NextResponse.json({ error: "שגיאה בשליחת הפנייה" }, { status: 500 });
  // The photographer's push and email follow their own language (photographers.ui_lang).
  const t = makeT(messagesFor(photographerLang(p.ui_lang)));
  await sendPushToPhotographer(p.id, { title: t("פנייה חדשה: {name}", { name }), body: [eventType, date].filter(Boolean).join(" · ") || t("מטופס הפנייה"), url: "/leads", tag: "new-lead" });

  const origin = new URL(request.url).origin;
  await sendEmail({
    to: notificationEmailFor(p.email),
    subject: t("פנייה חדשה מהטופס: {name}", { name }),
    text:
      `${t("שלום {name},", { name: p.name })}\n\n${t("התקבלה פנייה חדשה בטופס הפנייה שלך.")}\n\n${t("שם: {v}", { v: name })}\n${t("טלפון: {v}", { v: phone })}` +
      `${eventType ? `\n${t("אירוע: {v}", { v: eventType })}` : ""}${date ? `\n${t("תאריך: {v}", { v: date })}` : ""}${notes ? `\n${t("הערות: {v}", { v: notes })}` : ""}` +
      `\n\n${t("לכל הלידים: {url}", { url: `${origin}/leads` })}`,
  }).catch((e) => console.error("Form lead email failed:", p.id, e));
  return NextResponse.json({ ok: true });
}
