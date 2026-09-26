import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";
import { resolveChatPhotographer } from "@/lib/intakeChatAccess";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { cleanSource } from "@/lib/leadSource";

export const runtime = "nodejs";

// The plain inquiry form behind the chat page — used when the assistant isn't available for this
// photographer (off, plan, or this month's cap). No model call; straight into leads.
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { allowed } = await checkRateLimit(`intake-form:${clientIpFrom(request)}`, { maxRequests: 30, windowSeconds: 3600 });
  if (!allowed) return NextResponse.json({ error: "יותר מדי פניות. נסו שוב מאוחר יותר" }, { status: 429 });

  const body: { name?: string; phone?: string; date?: string; eventType?: string; notes?: string; src?: string } = await request.json().catch(() => ({}));
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
  });
  if (error) return NextResponse.json({ error: "שגיאה בשליחת הפנייה" }, { status: 500 });

  const origin = new URL(request.url).origin;
  await sendEmail({
    to: notificationEmailFor(p.email),
    subject: `פנייה חדשה מהטופס: ${name}`,
    text: `שלום ${p.name},\n\nהתקבלה פנייה חדשה בטופס הפנייה שלך.\n\nשם: ${name}\nטלפון: ${phone}${eventType ? `\nאירוע: ${eventType}` : ""}${date ? `\nתאריך: ${date}` : ""}${notes ? `\nהערות: ${notes}` : ""}\n\nלכל הלידים: ${origin}/leads`,
  }).catch((e) => console.error("Form lead email failed:", p.id, e));
  return NextResponse.json({ ok: true });
}
