import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import { createPayplusCheckoutLink, deletePayplusRecurring, PAYPLUS_BILLING } from "@/lib/payplus";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { Photographer } from "@/lib/types";
import { ADMIN_EMAIL } from "@/lib/admin";
import { deleteExpiredTrialAccount, isTrialDeletionCandidate, trialDeletionDate, TRIAL_RETENTION_DAYS, WARN_DAYS_BEFORE } from "@/lib/accountDeletion";

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
    // No recurring means nothing renews automatically, so there's nothing to remind about.
    .not("payplus_recurring_uid", "is", null)
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
          `כל האירועים, הגלריות והלקוחות שהכנסת נשמרים 30 יום אחרי סוף הניסיון, ואחרי התשלום ממשיכים בדיוק מאיפה שעצרת. בלי תשלום עד אז, החשבון והנתונים נמחקים.\n\n` +
          `צוות גילברטו`,
      });
      await supabase.from("photographers").update({ trial_reminder_sent_at: now.toISOString() }).eq("id", photographer.id);
      trialRemindedCount++;
    } catch (e) {
      console.error("Trial reminder failed:", photographer.id, e);
    }
  }

  // Trial data retention: an unpaid trial's data is kept TRIAL_RETENTION_DAYS after the trial end,
  // then deleted — after an email WARN_DAYS_BEFORE and another 1 day before. Each step needs the
  // previous one to have actually been sent, so nobody is ever deleted without both warnings, even
  // if the cron skipped days (the first warning always comes at least 7 days before deletion).
  const DAY_MS = 86_400_000;
  const retentionFields = "id, name, email, subscription_status, trial_ends_at, payplus_recurring_uid, keep_account, trial_deletion_warned_at, trial_deletion_final_warned_at";
  type RetentionRow = Pick<
    Photographer,
    "id" | "name" | "email" | "subscription_status" | "trial_ends_at" | "payplus_recurring_uid" | "keep_account" | "trial_deletion_warned_at" | "trial_deletion_final_warned_at"
  >;
  const { data: endedTrials } = await supabase
    .from("photographers")
    .select(retentionFields)
    .eq("subscription_status", "trialing")
    .eq("keep_account", false)
    .is("payplus_recurring_uid", null)
    .lte("trial_ends_at", now.toISOString())
    .returns<RetentionRow[]>();

  let retentionWarned = 0;
  let retentionFinalWarned = 0;
  const deletedAccounts: string[] = [];
  for (const p of endedTrials ?? []) {
    if (!isTrialDeletionCandidate(p, now) || !p.trial_ends_at) continue;
    const deleteAt = trialDeletionDate(p.trial_ends_at);
    const msLeft = deleteAt.getTime() - now.getTime();
    const deleteAtHe = deleteAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
    try {
      if (!p.trial_deletion_warned_at) {
        if (msLeft > WARN_DAYS_BEFORE * DAY_MS) continue;
        await sendEmail({
          to: notificationEmailFor(p.email),
          subject: `החשבון שלך בגילברטו יימחק ב-${deleteAtHe}`,
          text:
            `שלום ${p.name},\n\n` +
            `תקופת הניסיון שלך בגילברטו הסתיימה, ועדיין לא נבחר מסלול. כפי שמופיע בתנאי השימוש, הנתונים נשמרים ` +
            `${TRIAL_RETENTION_DAYS} יום מסוף הניסיון, ולכן ב-${deleteAtHe} החשבון וכל מה שבו יימחקו לצמיתות: ` +
            `האירועים, הלקוחות, הגלריות והתמונות.\n\n` +
            `כדי לשמור הכל ולהמשיך בדיוק מאיפה שעצרת, בוחרים מסלול כאן:\n${siteUrl}/billing\n\n` +
            `צוות גילברטו`,
        });
        await supabase.from("photographers").update({ trial_deletion_warned_at: now.toISOString() }).eq("id", p.id);
        retentionWarned++;
        continue;
      }
      if (!p.trial_deletion_final_warned_at) {
        const firstWarnAgeMs = now.getTime() - new Date(p.trial_deletion_warned_at).getTime();
        if (msLeft > DAY_MS || firstWarnAgeMs < (WARN_DAYS_BEFORE - 1) * DAY_MS) continue;
        await sendEmail({
          to: notificationEmailFor(p.email),
          subject: "תזכורת אחרונה: החשבון שלך בגילברטו יימחק מחר",
          text:
            `שלום ${p.name},\n\n` +
            `מחר החשבון שלך בגילברטו וכל הנתונים שבו יימחקו לצמיתות, כי תקופת הניסיון הסתיימה ולא נבחר מסלול. ` +
            `אחרי המחיקה אי אפשר לשחזר אותם.\n\n` +
            `כדי לשמור הכל, בוחרים מסלול היום:\n${siteUrl}/billing\n\n` +
            `צוות גילברטו`,
        });
        await supabase.from("photographers").update({ trial_deletion_final_warned_at: now.toISOString() }).eq("id", p.id);
        retentionFinalWarned++;
        continue;
      }
      const finalWarnAgeMs = now.getTime() - new Date(p.trial_deletion_final_warned_at).getTime();
      // At most 5 deletions per run — each one walks the account's storage.
      if (msLeft > 0 || finalWarnAgeMs < 20 * 60 * 60 * 1000 || deletedAccounts.length >= 5) continue;
      const result = await deleteExpiredTrialAccount(supabase, p.id);
      if (result.deleted) {
        deletedAccounts.push(p.id);
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: "[ניסיון] חשבון נמחק אחרי 30 יום בלי תשלום",
          text: `נמחק חשבון ${p.name} (${p.id}). קבצים שנמחקו מהאחסון: ${result.objects ?? 0}.`,
        }).catch(() => {});
      }
    } catch (e) {
      console.error("Trial retention step failed:", p.id, e);
    }
  }

  // 6. Missed renewals. PayPlus sends no callback when a recurring charge fails (a card decline
  // showed up only in PayPlus's own failed report, 2026-09-28), so nothing in the app changed and
  // nobody knew. An active account whose paid period ended more than MISSED_RENEWAL_GRACE_DAYS ago
  // means the expected charge never landed (a success would have moved current_period_end forward),
  // or there's no recurring left to make it (removed in PayPlus). Access is untouched: locking is the
  // admin's call, from the admin dashboard (owner's decision, 2026-09-29). This only tells the
  // admin, once per period (missed_renewal_alerted_for).
  const MISSED_RENEWAL_GRACE_DAYS = 2;
  const missedCutoff = new Date(now.getTime() - MISSED_RENEWAL_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const { data: missedCandidates } = await supabase
    .from("photographers")
    .select("id, name, email, plan, current_period_end, payplus_recurring_uid, missed_renewal_alerted_for")
    .eq("subscription_status", "active")
    .eq("cancel_at_period_end", false)
    .not("current_period_end", "is", null)
    .lt("current_period_end", missedCutoff.toISOString())
    .returns<(Pick<Photographer, "id" | "name" | "email" | "plan" | "current_period_end" | "payplus_recurring_uid"> & { missed_renewal_alerted_for: string | null })[]>();

  let missedAlerted = 0;
  for (const p of missedCandidates ?? []) {
    const periodEnd = p.current_period_end!;
    if (p.missed_renewal_alerted_for && new Date(p.missed_renewal_alerted_for).getTime() === new Date(periodEnd).getTime()) continue;
    const periodEndHe = new Date(periodEnd).toLocaleDateString("he-IL");
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `[חיובים] חידוש מנוי לא נקלט: ${p.name}`,
        text:
          (p.payplus_recurring_uid
            ? `למנוי של ${p.name} (${p.email}, ${p.id}) הייתה אמורה להיות הוראת קבע שמחדשת אותו עד ${periodEndHe}, ` +
              `ועברו יותר מ-${MISSED_RENEWAL_GRACE_DAYS} ימים בלי חיוב שנקלט.\n\n` +
              `מה לבדוק: ב-PayPlus › עסקאות ודו״חות › דו״ח נכשלים, אם החיוב נדחה ולמה, ` +
              `וב-הוראות קבע › רשימת הוראות קבע, שההוראה של הלקוח עדיין פעילה.\n`
            : `התקופה ששולמה של ${p.name} (${p.email}, ${p.id}) הסתיימה ב-${periodEndHe}, ואין לו הוראת קבע שתחדש אותה.\n\n`) +
          `החשבון לא ננעל. לנעילה (הלקוח יופנה לעדכון אמצעי תשלום): לוח בקרה למנהל › חשבונות שלא העבירו תשלום. ` +
          `ההתראה נשלחת פעם אחת לכל תקופה.`,
      });
      await supabase.from("photographers").update({ missed_renewal_alerted_for: periodEnd }).eq("id", p.id);
      missedAlerted++;
    } catch (e) {
      console.error("Missed renewal alert failed:", p.id, e);
    }
  }

  return NextResponse.json({
    missedRenewalAlerted: missedAlerted,
    finalized: finalizedCount,
    reminded: remindedCount,
    switched: switchedCount,
    trialReminded: trialRemindedCount,
    retentionWarned,
    retentionFinalWarned,
    deleted: deletedAccounts.length,
  });
}
