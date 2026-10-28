import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import { createPayplusCheckoutLink, deletePayplusRecurring, PAYPLUS_BILLING, payplusLanguageFor } from "@/lib/payplus";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { Photographer } from "@/lib/types";
import { ADMIN_EMAIL } from "@/lib/admin";
import { alertBillingAdmin } from "@/lib/billingAlerts";
import { photographerLang } from "@/lib/clientLang";
import { nextDunningStage, dunningLockDate, UPCOMING_DAYS_BEFORE, type DunningFields } from "@/lib/dunning";
import { dunningEmail, planSwitchEmail, renewalReminderEmail, trialDeletionFinalWarningEmail, trialDeletionWarningEmail, trialEndingEmail } from "@/lib/billingEmails";
import { deleteExpiredTrialAccount, isTrialDeletionCandidate, trialDeletionDate, TRIAL_RETENTION_DAYS, WARN_DAYS_BEFORE } from "@/lib/accountDeletion";

// The public site, for every link this cron puts in an email or hands to PayPlus. Not the request's
// origin: Vercel runs the cron on the deployment's own *.vercel.app address, which is behind Vercel
// login, so the trial reminder linked customers to a login wall (2026-10-19), and a plan switch's
// checkout would have sent PayPlus's callback there too (same fix as retry-stuck-zip-jobs).
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://myframeflow.com";

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

    const planInfo = SUBSCRIPTION_PLANS[photographer.plan];
    const amount = PAYPLUS_BILLING[photographer.plan].amount;
    try {
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        ...renewalReminderEmail(photographerLang(photographer.ui_lang), {
          name: photographer.name,
          planLabel: planInfo.label,
          periodEnd: photographer.current_period_end!,
          amount,
        }),
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
  const baseUrl = SITE_URL;
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
      // Once the old recurring is really gone, the account has none until the new checkout is paid:
      // no renewal reminder for a charge that won't come, /billing open for the payment, and the
      // automatic unpaid-subscription emails (step 6) if it never comes. If cancelling failed, the uid stays, so the
      // webhook cancels it as superseded when the new checkout is paid, and the admin is told.
      let oldRecurringGone = !photographer.payplus_recurring_uid;
      if (photographer.payplus_recurring_uid) {
        try {
          await deletePayplusRecurring(photographer.payplus_recurring_uid);
          oldRecurringGone = true;
        } catch (e) {
          // Proceed regardless — setting up the new recurring below doesn't depend on the old one
          // actually being gone, and leaving the person stuck with neither is worse.
          console.error(`Failed to cancel prior recurring for ${photographer.id}:`, e);
          await alertBillingAdmin(
            `החלפת מסלול: הוראת הקבע הקודמת לא בוטלה (${photographer.name})`,
            `בהחלפת המסלול של ${photographer.name} (${photographer.id}), ביטול הוראת הקבע הקודמת ב-PayPlus נכשל, ` +
              `והיא עלולה לחייב לצד המסלול החדש.\n\nהוראת הקבע: ${photographer.payplus_recurring_uid}\n` +
              `שגיאה: ${e instanceof Error ? e.message : "לא ידועה"}\n\nמה לעשות: למחוק אותה ב-PayPlus › הוראות קבע.`
          );
        }
      }

      const { paymentPageLink } = await createPayplusCheckoutLink({
        photographerId: photographer.id,
        plan: targetPlan,
        customerName: photographer.name,
        customerEmail: notificationEmailFor(photographer.email),
        customerPhone: photographer.phone,
        baseUrl,
        language: payplusLanguageFor(photographer.ui_lang),
      });

      const targetInfo = SUBSCRIPTION_PLANS[targetPlan];
      const targetAmount = PAYPLUS_BILLING[targetPlan].amount;
      const wasOnLongCycle = PAYPLUS_BILLING[photographer.plan].recurringRangeMonths > 1;
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        ...planSwitchEmail(photographerLang(photographer.ui_lang), {
          name: photographer.name,
          targetLabel: targetInfo.label,
          targetAmount,
          targetPricePerMonth: targetInfo.pricePerMonth,
          wasOnLongCycle,
          paymentLink: paymentPageLink,
        }),
      });

      await supabase
        .from("photographers")
        .update({ pending_plan: null, pending_plan_effective_at: null, ...(oldRecurringGone ? { payplus_recurring_uid: null } : {}) })
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
    .select("id, name, email, trial_ends_at, ui_lang")
    .eq("subscription_status", "trialing")
    .is("trial_reminder_sent_at", null)
    .not("trial_ends_at", "is", null)
    .gt("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", trialCutoff.toISOString())
    .returns<Pick<Photographer, "id" | "name" | "email" | "trial_ends_at" | "ui_lang">[]>();

  let trialRemindedCount = 0;
  const siteUrl = SITE_URL;
  for (const photographer of trialsEnding ?? []) {
    try {
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        ...trialEndingEmail(photographerLang(photographer.ui_lang), { name: photographer.name, siteUrl }),
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
  const retentionFields = "id, name, email, subscription_status, trial_ends_at, payplus_recurring_uid, keep_account, trial_deletion_warned_at, trial_deletion_final_warned_at, ui_lang";
  type RetentionRow = Pick<
    Photographer,
    "id" | "name" | "email" | "subscription_status" | "trial_ends_at" | "payplus_recurring_uid" | "keep_account" | "trial_deletion_warned_at" | "trial_deletion_final_warned_at" | "ui_lang"
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
    const lang = photographerLang(p.ui_lang);
    try {
      if (!p.trial_deletion_warned_at) {
        if (msLeft > WARN_DAYS_BEFORE * DAY_MS) continue;
        await sendEmail({
          to: notificationEmailFor(p.email),
          ...trialDeletionWarningEmail(lang, { name: p.name, deleteAt, retentionDays: TRIAL_RETENTION_DAYS, siteUrl }),
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
          ...trialDeletionFinalWarningEmail(lang, { name: p.name, siteUrl }),
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

  // 6. Unpaid subscriptions, automatically (lib/dunning.ts, owner's decision 2026-10-28): emails the
  // customer a payment link before and on the due date and the day before the lock, then locks the
  // account (past_due) and tells the admin, who steps in only to unlock. One stage per account per
  // run. PayPlus sends no callback when a recurring charge fails (a card decline showed up only in
  // PayPlus's own failed report, 2026-09-28), so a declined renewal is known only by the paid period
  // passing without a charge. A manual unlock from the admin dashboard sticks: the stage for that
  // period is already "locked".
  const { data: dunningCandidates } = await supabase
    .from("photographers")
    .select("id, name, email, ui_lang, subscription_status, cancel_at_period_end, current_period_end, payplus_recurring_uid, keep_account, dunning_for, dunning_stage")
    .eq("subscription_status", "active")
    .eq("cancel_at_period_end", false)
    .not("current_period_end", "is", null)
    .lte("current_period_end", new Date(now.getTime() + UPCOMING_DAYS_BEFORE * 24 * 60 * 60 * 1000).toISOString())
    .returns<(Pick<Photographer, "id" | "name" | "email" | "ui_lang"> & DunningFields)[]>();

  const dunningSent: Record<number, number> = {};
  for (const p of dunningCandidates ?? []) {
    const stage = nextDunningStage(p, p.email.toLowerCase() === ADMIN_EMAIL.toLowerCase(), now);
    if (!stage) continue;
    try {
      // The stage is recorded first: a run that dies after it never emails the same stage twice.
      const { data: claimed } = await supabase
        .from("photographers")
        .update({
          dunning_for: p.current_period_end,
          dunning_stage: stage,
          ...(stage === 4 ? { subscription_status: "past_due" } : {}),
        })
        .eq("id", p.id)
        .eq("subscription_status", "active")
        .eq("current_period_end", p.current_period_end!)
        .select("id")
        .maybeSingle();
      if (!claimed) continue;
      await sendEmail({
        to: notificationEmailFor(p.email),
        ...dunningEmail(photographerLang(p.ui_lang), stage, {
          name: p.name,
          periodEnd: p.current_period_end!,
          lockDate: dunningLockDate(p)!,
          declined: !!p.payplus_recurring_uid,
          siteUrl: SITE_URL,
        }),
      });
      if (stage === 4) {
        await alertBillingAdmin(
          `חשבון ננעל אוטומטית: ${p.name}`,
          `החשבון של ${p.name} (${p.email}, ${p.id}) ננעל כי לא התקבל תשלום על המנוי ` +
            `(${p.payplus_recurring_uid ? "החיוב החודשי לא עבר" : "אין חיוב חודשי שמחדש אותו"}; ` +
            `התקופה ששולמה הסתיימה ב-${new Date(p.current_period_end!).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}). ` +
            `הלקוח קיבל 2–3 מיילים עם קישור תשלום לפני הנעילה, ועכשיו מייל שהחשבון נחסם. תשלום פותח את החשבון לבד.\n\n` +
            `אין צורך לעשות דבר. רק אם הלקוח אומר ששילם, או שצריך לתת לו עוד זמן: לוח בקרה למנהל › חשבונות שלא העבירו תשלום › הסרת נעילה.`
        );
      }
      dunningSent[stage] = (dunningSent[stage] ?? 0) + 1;
    } catch (e) {
      console.error("Dunning step failed:", p.id, stage, e);
    }
  }

  // 7. PayPlus callbacks left without an outcome: the run died half-way (a timeout, a failed update)
  // and no retry took it over (see claimEvent in the webhook). The charge may have happened while
  // the account still shows locked. Each one is reported once: this run covers what was recorded
  // between 25 and 1 hours ago, and the next daily run starts where this one ended.
  const { data: stuckEvents } = await supabase
    .from("payplus_webhook_events")
    .select("created_at, transaction_uid, photographer_id, receipt_status")
    .is("outcome", null)
    .gte("created_at", new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString())
    .lt("created_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString())
    .returns<{ created_at: string; transaction_uid: string | null; photographer_id: string | null; receipt_status: string | null }[]>();
  if (stuckEvents && stuckEvents.length > 0) {
    await alertBillingAdmin(
      "עדכון תשלום מ-PayPlus לא הושלם",
      `${stuckEvents.length} עדכונים מ-PayPlus התקבלו אבל הטיפול בהם לא הסתיים:\n\n` +
        stuckEvents
          .map((e) => `${e.created_at} · חשבון ${e.photographer_id ?? "?"} · עסקה ${e.transaction_uid ?? "?"} · קבלה: ${e.receipt_status ?? "לא הופקה"}`)
          .join("\n") +
        `\n\nמה לבדוק: ב-PayPlus אם החיוב עבר, ובחשבון שהסטטוס active ותאריך החידוש עודכן. אם לא, לעדכן ידנית ולהפיק קבלה.`
    );
  }

  return NextResponse.json({
    stuckWebhookEvents: stuckEvents?.length ?? 0,
    dunning: dunningSent,
    finalized: finalizedCount,
    reminded: remindedCount,
    switched: switchedCount,
    trialReminded: trialRemindedCount,
    retentionWarned,
    retentionFinalWarned,
    deleted: deletedAccounts.length,
  });
}
