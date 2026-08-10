import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
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
  // each new cycle gets its own fresh reminder instead of being silenced forever.
  const { data: dueForReminder } = await supabase
    .from("photographers")
    .select("*")
    .eq("auto_renew", true)
    .eq("cancel_at_period_end", false)
    .eq("subscription_status", "active")
    .is("renewal_reminder_sent_at", null)
    .not("current_period_end", "is", null)
    .gt("current_period_end", now.toISOString())
    .returns<Photographer[]>();

  let remindedCount = 0;
  for (const photographer of dueForReminder ?? []) {
    const reminderDays = photographer.plan === "annual" ? ANNUAL_REMINDER_DAYS_BEFORE : MONTHLY_REMINDER_DAYS_BEFORE;
    const reminderCutoff = new Date(now.getTime() + reminderDays * 24 * 60 * 60 * 1000);
    if (new Date(photographer.current_period_end!) > reminderCutoff) continue;

    const renewalDateHe = new Date(photographer.current_period_end!).toLocaleDateString("he-IL");
    const planInfo = SUBSCRIPTION_PLANS[photographer.plan];
    const amount = photographer.plan === "annual" ? 500 : planInfo.pricePerMonth;
    try {
      await sendEmail({
        to: photographer.email,
        subject: `המנוי שלך יחודש בקרוב — ${renewalDateHe}`,
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

  return NextResponse.json({ finalized: finalizedCount, reminded: remindedCount });
}
