import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createEventWithSideEffects } from "@/lib/createEvent";
import { ADMIN_EMAIL } from "@/lib/admin";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { packageLabel, type PackageType } from "@/lib/stages";
import type { LeadRow, Photographer } from "@/lib/types";
import { packageFromItems, type LeadQuoteDetails } from "@/lib/leadQuote";
import { createQuoteContract, latestContract } from "@/lib/quoteContract";
import type { EventContractRow } from "@/lib/types";
import { photographerLang } from "@/lib/clientLang";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

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
      .maybeSingle<LeadRow & { quote_details: LeadQuoteDetails | null; photographers: Photographer | null }>();

    if (!lead || !lead.quoted_amount) {
      return NextResponse.json({ error: "הצעת המחיר לא נמצאה" }, { status: 404 });
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
      // A reload after the questionnaire: back to the contract step when one was sent.
      const contract = lead.quote_details?.withContract ? await latestContract(supabase, lead.converted_event_id) : null;
      return NextResponse.json({ ok: true, alreadyConverted: true, clientAccessToken: existing?.client_access_token ?? null, contract });
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
      hoursNotice?: string;
    } = await request.json().catch(() => ({}));

    if (!body.clientName?.trim() || !body.eventDate) {
      return NextResponse.json({ error: "יש למלא שם מלא ותאריך אירוע" }, { status: 400 });
    }

    const isCustom = lead.package_interest?.startsWith("custom:") ?? false;
    const customPackageId = isCustom ? lead.package_interest!.slice(7) : null;
    // A quote from the quote builder has items, not a package (owner, 2026-10-01: the client got
    // "לא הוגדרה חבילה" right after approving). The event's stages come from the items then
    // (lib/leadQuote.ts), and the photographer can change the package on the event.
    const pkgFromItems = !lead.package_interest && lead.quote_details?.items?.length ? packageFromItems(lead.quote_details.items) : null;
    const pkg = (!isCustom ? (lead.package_interest as PackageType | null) : null) ?? pkgFromItems ?? (customPackageId ? null : "stills");
    // The quote's lines and what the client was told about the hours go on the event's notes.
    const quoteLines = lead.quote_details?.items?.length ? `הצעת המחיר: ${lead.quote_details.items.map((it) => it.item).join(", ")}` : null;
    // The extra-hours notice is the owner's own rule (lib/leadQuote.ts): only their clients see it.
    const hoursNotice = lead.photographers?.email === ADMIN_EMAIL && body.hoursNotice?.trim() ? `שעות מעבר לחבילה: ${body.hoursNotice.trim().slice(0, 300)}` : null;
    const eventNotes = [(body.notes ?? "").trim(), hoursNotice, quoteLines].filter(Boolean).join("\n");

    const result = await createEventWithSideEffects(supabase, {
      photographerId: lead.photographer_id,
      clientName: body.clientName.trim(),
      eventType: lead.event_type_name,
      clientPhone: (body.clientPhone ?? lead.phone ?? "").trim(),
      pkg,
      customPackageId,
      eventDate: body.eventDate,
      eventStartTime: body.eventStartTime || null,
      eventEndTime: body.eventEndTime || null,
      eventLocation: (body.eventLocation ?? "").trim(),
      arrivalTime: (body.arrivalTime ?? "").trim(),
      notes: eventNotes,
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

    // UI languages phase 2: the event keeps the lead's client language, so the portal, the gallery
    // and the contract page follow it later.
    if (lead.client_lang) {
      const { error: langError } = await supabase.from("events").update({ client_lang: lead.client_lang }).eq("id", result.event.id);
      if (langError) console.error("[submit-questionnaire] client_lang copy failed", langError);
    }

    // "With a contract": the questionnaire's last step is signing it (lib/quoteContract.ts).
    let contract: EventContractRow | null = null;
    if (lead.quote_details?.withContract) {
      contract = await createQuoteContract(supabase, result.event.id).catch((e) => {
        console.error("[submit-questionnaire] contract creation failed", e);
        return null;
      });
    }

    if (lead.photographers?.email) {
      // To the photographer, in their own language (photographers.ui_lang); Hebrew when unset.
      const lang = photographerLang(lead.photographers.ui_lang);
      const t = makeT(messagesFor(lang));
      const money = (n: number | null) => (lang === "he" ? `₪${n}` : `₪${(n ?? 0).toLocaleString(dateLocale(lang))}`);
      const eventDateStr = new Date(result.event.event_date).toLocaleDateString(dateLocale(lang));
      try {
        await sendEmail({
          to: notificationEmailFor(lead.photographers.email),
          subject: t("אירוע חדש נוצר אוטומטית | {name}", { name: result.event.client_name }),
          text:
            `${t("שלום {name},", { name: lead.photographers.name })}\n\n` +
            `${t("הלקוח/ה {name} אישר/ה את הצעת המחיר ומילא/ה שאלון פרטים. האירוע נוסף אוטומטית ליומן שלך.", { name: result.event.client_name })}\n\n` +
            `${t("פרטי האירוע:")}\n` +
            `${t("שם הלקוח/ה: {v}", { v: result.event.client_name })}\n` +
            `${t("טלפון: {v}", { v: result.event.client_phone || t("לא הוזן") })}\n` +
            `${t("תאריך: {v}", { v: eventDateStr })}\n` +
            `${t("מיקום: {v}", { v: result.event.event_location || t("יעודכן") })}\n` +
            `${t("חבילה: {v}", { v: t(packageLabel(result.event.package, null)) })}\n` +
            `${t("מקדמה: {deposit} · יתרה לתשלום: {balance}", { deposit: money(0), balance: money(lead.quoted_amount) })}` +
            `${pkgFromItems ? `\n${t("(החבילה נבחרה לפי פריטי ההצעה. אפשר לשנות אותה בעמוד האירוע.)")}` : ""}${hoursNotice ? `\n${hoursNotice}` : ""}\n\n` +
            `${contract ? `\n${t("החוזה הוצג ללקוח/ה לחתימה כשלב האחרון בשאלון. כשייחתם, שלב סגירת האירוע יסומן כבוצע ותקבל/י עדכון.")}\n` : ""}\n` +
            t("ניתן לעדכן את פרטי המקדמה/יתרה ולעקוב אחרי האירוע בעמוד האירוע במערכת."),
        });
      } catch (e) {
        console.error("[submit-questionnaire] failed to send new-event email", e);
      }
    }

    return NextResponse.json({ ok: true, eventId: result.event.id, clientAccessToken: result.event.client_access_token, contract });
  } catch (e) {
    console.error("[submit-questionnaire] unhandled error", e);
    return NextResponse.json({ error: "שגיאה ביצירת האירוע" }, { status: 500 });
  }
}
