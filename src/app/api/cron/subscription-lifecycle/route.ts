import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import { createPayplusCheckoutLink, deletePayplusRecurring, PAYPLUS_BILLING } from "@/lib/payplus";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { Photographer } from "@/lib/types";

const ANNUAL_REMINDER_DAYS_BEFORE = 30;
const MONTHLY_REMINDER_DAYS_BEFORE = 7;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();

  // 1. Finalize cancellations whose paid period has actually ended. The PayPlus recurring
  // charge was already stopped at cancel-time (see /api/payplus/cancel) — this just flips
  // subscription_status once the access window the customer already paid for runs out.
  const { data: toFinalize } = await supabase
    .from("photographers")
    .select("id")
    .eq("cancel_at_period_end", true)
    .eq("subscription_status", "active")
    .not("current_period_end", "is", null)
    .lte("current_period_end", now.toISOString())
    .returns<{ id: string }[]>();

  let finalizedCount = 0;
  for (const photographer of toFinalize ?? []) {
    await supabase.from("photographers").update({ subscription_status: "canceled" }).eq("id", photographer.id);
    finalizedCount++;
  }

  // 2. Renewal reminders — annual gets a month's notice, monthly a week's. Guarded by
  // renewal_reminder_sent_at, which the PayPlus webhook clears on every successful charge so
  // each new cycle gets its own fresh reminder instead of being silenced forever. Excludes
  // anyone with a pending plan switch — their real next charge (amount, plan, and date) is
  // whatever step 3 below is about to set up, not the current plan's own renewal.
  const { data: dueForReminder } = await supabase
    .from("photographers")
    .select("*")
    .eq("auto_renew", true)
    .eq("cancel_at_period_end", false)
    .eq("subscription_status", "active")
    .is("renewal_reminder_sent_at", null)
    .is("pending_plan", null)
    .not("current_period_end", "is", null)
    .gt("current_period_end", now.toISOString())
    .returns<Photographer[]>();

  let remindedCount = 0;
  for (const photographer of dueForReminder ?? []) {
    const reminderDays =
      PAYPLUS_BILLING[photographer.plan].recurringRangeMonths > 1 ? ANNUAL_REMINDER_DAYS_BEFORE : MONTHLY_REMINDER_DAYS_BEFORE;
    const reminderCutoff = new Date(now.getTime() + reminderDays * 24 * 60 * 60 * 1000);
    if (new Date(photographer.current_period_end!) > reminderCutoff) continue;

    const renewalDateHe = new Date(photographer.current_period_end!).toLocaleDateString("he-IL");
    const planInfo = SUBSCRIPTION_PLANS[photographer.plan];
    const amount = PAYPLUS_BILLING[photographer.plan].amount;
    try {
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        subject: `המנוי שלך יחודש בקרוב | ${renewalDateHe}`,
        text:
          `שלום ${photographer.name},\n\n` +
          `המנוי ${planInfo.label} שלך במערכת גילברטו יחודש אוטומטית בתאריך ${renewalDateHe} בסך ₪${amount}.\n` +
          `אם ברצונך לכבות את החידוש האוטומטי, ניתן לעשות זאת בכל עת מתוך הגדרות > מנוי.\n\n` +
          `תודה שאת/ה חלק מהמערכת!`,
      });
    } catch (e) {
      console.error("Renewal reminder email failed:", e);
    }
    await supabase
      .from("photographers")
      .update({ renewal_reminder_sent_at: now.toISOString() })
      .eq("id", photographer.id);
    remindedCount++;
  }

  // 3. Plan switches whose scheduled date has arrived (see computePlanSwitchEffectiveDate) — a
  // switch is never applied in place: PayPlus's own recurring charges are fixed amount/cadence,
  // so the only way to actually change what gets charged is to cancel the current recurring and
  // set up a fresh one at the new plan's price. That new recurring needs the person to complete
  // a checkout page again (no API here to silently rebill a saved card onto a new recurring
  // agreement) — so this sends them a link instead of charging anything itself. pending_plan is
  // cleared regardless of whether they ever complete that checkout: subscription_status stays
  // "active" either way, matching this system's existing (not further-automated) handling of a
  // lapsed recurring charge in general.
  const baseUrl = new URL(request.url).origin;
  const { data: dueSwitches } = await supabase
    .from("photographers")
    .select("*")
    .not("pending_plan", "is", null)
    .not("pending_plan_effective_at", "is", null)
    .lte("pending_plan_effective_at", now.toISOString())
    .eq("subscription_status", "active")
    .returns<Photographer[]>();

  let switchedCount = 0;
  for (const photographer of dueSwitches ?? []) {
    const targetPlan = photographer.pending_plan;
    if (!targetPlan || !(targetPlan in SUBSCRIPTION_PLANS)) continue;
    try {
      if (photographer.payplus_recurring_uid) {
        await deletePayplusRecurring(photographer.payplus_recurring_uid).catch((e) => {
          // Proceed regardless — setting up the new recurring below doesn't depend on the old
          // one actually being gone, and leaving the person stuck with neither is worse.
          console.error(`Failed to cancel prior recurring for ${photographer.id}:`, e);
        });
      }

      const { paymentPageLink } = await createPayplusCheckoutLink({
        photographerId: photographer.id,
        plan: targetPlan,
        customerName: photographer.name,
        customerEmail: notificationEmailFor(photographer.email),
        customerPhone: photographer.phone,
        baseUrl,
      });

      const targetInfo = SUBSCRIPTION_PLANS[targetPlan];
      const targetAmount = PAYPLUS_BILLING[targetPlan].amount;
      const wasOnLongCycle = PAYPLUS_BILLING[photographer.plan].recurringRangeMonths > 1;
      const reasonText = wasOnLongCycle
        ? `זהו החיוב עבור החודשים ה-11 וה-12 של תקופת המנוי הקודמת שלך, בעקבות המעבר למסלול ${targetInfo.label} שביקשת, במקום שיהיו חינמיים כמו במסלול הקודם. החל מהמחזור שאחרי כן תחויב/י ₪${targetInfo.pricePerMonth} מדי חודש כמסלול ${targetInfo.label} רגיל.`
          : `כפי שביקשת, המנוי שלך עובר למסלול ${targetInfo.label} (₪${targetAmount}) החל מהמחזור הבא.`;

      await sendEmail({
        to: notificationEmailFor(photographer.email),
        subject: "המעבר למסלול החדש שלך | נדרשת השלמת תשלום",
        text: `שלום ${photographer.name},\n\n${reasonText}\n\nלהשלמת התשלום: ${paymentPageLink}\n\nתודה!`,
      });

      await supabase
        .from("photographers")
        .update({ pending_plan: null, pending_plan_effective_at: null })
        .eq("id", photographer.id);
      switchedCount++;
    } catch (e) {
      console.error(`Plan switch failed for ${photographer.id}:`, e);
    }
  }

  // 4. Free trial ending tomorrow: one reminder email (runs daily at 07:00 UTC, so "ends within
  // the next 36 hours" catches it exactly once, the day before). Access itself needs no cron:
  // hasAppAccess() compares trial_ends_at to now on every page load.
  const trialCutoff = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  const { data: trialsEnding } = await supabase
    .from("photographers")
    .select("id, name, email, trial_ends_at")
    .eq("subscription_status", "trialing")
    .is("trial_reminder_sent_at", null)
    .not("trial_ends_at", "is", null)
    .gt("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", trialCutoff.toISOString())
    .returns<Pick<Photographer, "id" | "name" | "email" | "trial_ends_at">[]>();

  let trialRemindedCount = 0;
  const siteUrl = new URL(request.url).origin;
  for (const photographer of trialsEnding ?? []) {
    try {
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        subject: "תקופת הניסיון בגילברטו מסתיימת מחר",
        text:
          `שלום ${photographer.name},\n\n` +
          `תקופת הניסיון שלך במערכת גילברטו מסתיימת מחר. כדי להמשיך לעבוד בלי הפסקה, בוחרים מסלול כאן:\n` +
          `${siteUrl}/billing\n\n` +
          `כל האירועים, הגלריות והלקוחות שהכנסת נשמרים, ואחרי התשלום ממשיכים בדיוק מאיפה שעצרת.\n\n` +
          `צוות גילברטו`,
      });
      await supabase.from("photographers").update({ trial_reminder_sent_at: now.toISOString() }).eq("id", photographer.id);
      trialRemindedCount++;
    } catch (e) {
      console.error("Trial reminder failed:", photographer.id, e);
    }
  }

  return NextResponse.json({ finalized: finalizedCount, reminded: remindedCount, switched: switchedCount, trialReminded: trialRemindedCount });
}
