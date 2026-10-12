import type { SupabaseClient } from "@supabase/supabase-js";
import type { DateConflict } from "@/lib/dateConflict";
import { sendPushToPhotographer } from "@/lib/push";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { photographerLang } from "@/lib/clientLang";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// A client tried to go ahead with a quote on a date already taken: when approving it
// (quotes/[token]/approve) or in the questionnaire after it (submit-questionnaire). The client is
// asked to call the photographer, and the photographer gets a phone notification and an email
// (owner, 2026-10-12: close the gap on both sides). Once per lead and date
// (leads.date_conflict_notified_for, claimed atomically), so retrying the same date doesn't send it
// again.
export async function notifyDateTaken(
  supabase: SupabaseClient,
  lead: { id: string; photographer_id: string; photographers: { name: string; email: string | null; ui_lang?: string | null } | null },
  o: { date: string; clientName: string; clientPhone: string; takenBy: DateConflict; stage: "approve" | "questionnaire" }
): Promise<void> {
  const p = lead.photographers;
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return;
  const { data: claimed, error } = await supabase
    .from("leads")
    .update({ date_conflict_notified_for: o.date })
    .eq("id", lead.id)
    .or(`date_conflict_notified_for.is.null,date_conflict_notified_for.neq.${o.date}`)
    .select("id");
  if (error) console.error("[dateTakenNotify] claim failed", error);
  if (!claimed?.length) return;

  const t = makeT(messagesFor(photographerLang(p.ui_lang)));
  const dateStr = new Date(o.date).toLocaleDateString(dateLocale(photographerLang(p.ui_lang)));
  const vars = { client: o.clientName, date: dateStr, other: o.takenBy.name };
  await sendPushToPhotographer(lead.photographer_id, {
    title: t("{name} רצו לאשר את ההצעה, אבל התאריך תפוס", { name: o.clientName }),
    body: t("{date} כבר תפוס אצלך ({other}). הם התבקשו להתקשר אליך.", vars),
    url: "/leads",
    tag: `date-taken-${lead.id}`,
  });
  if (!p.email) return;
  try {
    await sendEmail({
      to: notificationEmailFor(p.email),
      subject: t("התאריך כבר תפוס | {name}", { name: o.clientName }),
      text:
        `${t("שלום {name},", { name: p.name })}\n\n` +
        `${
          o.stage === "approve"
            ? t("{client} לחץ/ה על אישור הצעת המחיר, אבל התאריך {date} כבר תפוס אצלך ({other}). ההצעה לא אושרה והאירוע לא נוצר.", vars)
            : t("{client} אישר/ה את הצעת המחיר, אבל לא הצליח/ה לסיים את שאלון הפרטים: התאריך {date} כבר תפוס אצלך ({other}). האירוע לא נוצר.", vars)
        }\n` +
        `${t("הלקוח/ה התבקש/ה ליצור איתך קשר טלפוני כדי למצוא פתרון.")}\n\n` +
        `${t("טלפון: {v}", { v: o.clientPhone || t("לא הוזן") })}\n\n` +
        t("אחרי שמתאמים תאריך אחר או מפנים את התאריך, הלקוח/ה יכול/ה להמשיך מאותו קישור להצעת המחיר."),
    });
  } catch (e) {
    console.error("[dateTakenNotify] email failed", e);
  }
}
