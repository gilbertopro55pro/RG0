import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import { createEventWithSideEffects } from "@/lib/createEvent";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { packageLabel, type PackageType } from "@/lib/stages";
import type { LeadRow, Photographer } from "@/lib/types";

// Public, token-authenticated, admin-gated (see approve/route.ts's own comment) — the second and
// final step of the quote-approval flow. The client fills in exactly the details a "new event"
// needs (mirroring NewEventModal.tsx's own form), and this creates the real event the same way
// the photographer's own form would, via the shared createEventWithSideEffects. Deposit/balance
// are deliberately NOT client-editable — the client sets event logistics, never their own payment
// terms; balance defaults to the full quoted amount and the photographer adjusts it afterward via
// the normal event-editing screen, exactly like a manually-booked event.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const supabase = createServiceRoleClient();

    const { data: lead } = await supabase
      .from("leads")
      .select("*, photographers(*)")
      .eq("quote_token", token)
      .maybeSingle<LeadRow & { photographers: Photographer | null }>();

    if (!lead || !lead.quoted_amount) {
      return NextResponse.json({ error: "הצעת המחיר לא נמצאה" }, { status: 404 });
    }
    if (lead.photographers?.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "התכונה עדיין לא זמינה" }, { status: 403 });
    }
    if (!lead.quote_approved_at) {
      return NextResponse.json({ error: "יש לאשר קודם את הצעת המחיר" }, { status: 400 });
    }
    if (lead.converted_event_id) {
      const { data: existing } = await supabase
        .from("events")
        .select("client_access_token")
        .eq("id", lead.converted_event_id)
        .maybeSingle<{ client_access_token: string }>();
      return NextResponse.json({ ok: true, alreadyConverted: true, clientAccessToken: existing?.client_access_token ?? null });
    }

    const body: {
      clientName?: string;
      clientPhone?: string;
      eventDate?: string;
      eventStartTime?: string | null;
      eventEndTime?: string | null;
      eventLocation?: string;
      arrivalTime?: string;
      notes?: string;
    } = await request.json().catch(() => ({}));

    if (!body.clientName?.trim() || !body.eventDate) {
      return NextResponse.json({ error: "יש למלא שם מלא ותאריך אירוע" }, { status: 400 });
    }

    const isCustom = lead.package_interest?.startsWith("custom:") ?? false;
    const pkg = (!isCustom ? (lead.package_interest as PackageType | null) : null) ?? null;
    const customPackageId = isCustom ? lead.package_interest!.slice(7) : null;
    if (!pkg && !customPackageId) {
      return NextResponse.json({ error: "לא הוגדרה חבילה להצעת המחיר הזו" }, { status: 400 });
    }

    const result = await createEventWithSideEffects(supabase, {
      photographerId: lead.photographer_id,
      clientName: body.clientName.trim(),
      clientPhone: (body.clientPhone ?? lead.phone ?? "").trim(),
      pkg,
      customPackageId,
      eventDate: body.eventDate,
      eventStartTime: body.eventStartTime || null,
      eventEndTime: body.eventEndTime || null,
      eventLocation: (body.eventLocation ?? "").trim(),
      arrivalTime: (body.arrivalTime ?? "").trim(),
      notes: (body.notes ?? "").trim(),
      deposit: 0,
      balance: lead.quoted_amount,
      paymentReminderDate: null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await supabase
      .from("leads")
      .update({ converted_event_id: result.event.id, status: "won" })
      .eq("id", lead.id);

    if (lead.photographers?.email) {
      const eventDateStr = new Date(result.event.event_date).toLocaleDateString("he-IL");
      try {
        await sendEmail({
          to: notificationEmailFor(lead.photographers.email),
          subject: `אירוע חדש נוצר אוטומטית — ${result.event.client_name}`,
          text: `שלום ${lead.photographers.name},

הלקוח/ה ${result.event.client_name} אישר/ה את הצעת המחיר ומילא/ה שאלון פרטים — האירוע נוסף אוטומטית ליומן שלך.

פרטי האירוע:
שם הלקוח/ה: ${result.event.client_name}
טלפון: ${result.event.client_phone || "לא הוזן"}
תאריך: ${eventDateStr}
מיקום: ${result.event.event_location || "יעודכן"}
חבילה: ${packageLabel(result.event.package, null)}
מקדמה: ₪0 · יתרה לתשלום: ₪${lead.quoted_amount}

ניתן לעדכן את פרטי המקדמה/יתרה ולעקוב אחרי האירוע בעמוד האירוע במערכת.`,
        });
      } catch (e) {
        console.error("[submit-questionnaire] failed to send new-event email", e);
      }
    }

    return NextResponse.json({ ok: true, eventId: result.event.id, clientAccessToken: result.event.client_access_token });
  } catch (e) {
    console.error("[submit-questionnaire] unhandled error", e);
    return NextResponse.json({ error: "שגיאה ביצירת האירוע" }, { status: 500 });
  }
}
