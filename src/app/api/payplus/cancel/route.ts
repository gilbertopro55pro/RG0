import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { deletePayplusRecurring } from "@/lib/payplus";
import { alertBillingAdmin } from "@/lib/billingAlerts";
import type { Photographer } from "@/lib/types";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Photographer>();
  if (!photographer) {
    return NextResponse.json({ error: "רק צלמים יכולים לבטל מנוי" }, { status: 403 });
  }
  if (photographer.cancel_at_period_end) {
    return NextResponse.json({ ok: true, current_period_end: photographer.current_period_end });
  }
  // An active paid period with no recurring left (a plan switch waiting for its new payment) has
  // nothing to stop in PayPlus, and is still cancelled the same way.
  const nothingToStop = !photographer.payplus_recurring_uid;
  if (nothingToStop && (photographer.subscription_status !== "active" || !photographer.current_period_end)) {
    return NextResponse.json({ error: "לא נמצא מנוי פעיל לביטול" }, { status: 400 });
  }

  // Stops the NEXT charge immediately. Access itself stays "active" until current_period_end — the
  // subscription-lifecycle cron flips subscription_status to "canceled" only once that already-paid-
  // for period actually elapses.
  if (photographer.payplus_recurring_uid) {
    try {
      await deletePayplusRecurring(photographer.payplus_recurring_uid);
    } catch (e) {
      console.error(`Cancelling the recurring of ${user.id} failed:`, e);
      await alertBillingAdmin(
        `ביטול מנוי נכשל: ${photographer.name}`,
        `${photographer.name} (${user.id}) ביקש לבטל את המנוי, אבל ביטול הוראת הקבע ב-PayPlus נכשל, והחיוב הבא עלול לצאת.\n\n` +
          `הוראת הקבע: ${photographer.payplus_recurring_uid}\nשגיאה: ${e instanceof Error ? e.message : "לא ידועה"}\n\n` +
          `מה לעשות: למחוק את הוראת הקבע ב-PayPlus › הוראות קבע, ולסמן את המנוי כמבוטל.`
      );
      // No error text: the settings screen shows its own translated "couldn't cancel" message.
      return NextResponse.json({}, { status: 502 });
    }
  }

  // The cancel and renewal flags are server-only (photographers_guard_privileged, migration 0165).
  const { error } = await createServiceRoleClient()
    .from("photographers")
    .update({ cancel_at_period_end: true, auto_renew: false })
    .eq("id", user.id);
  if (error) {
    // The charges already stopped in PayPlus; only the app's record of it is missing.
    console.error(`Saving the cancellation of ${user.id} failed:`, error);
    await alertBillingAdmin(
      `ביטול מנוי לא נשמר: ${photographer.name}`,
      `הוראת הקבע של ${photographer.name} (${user.id}) בוטלה ב-PayPlus, אבל שמירת הביטול במערכת נכשלה.\n\n` +
        `שגיאה: ${error.message}\n\nמה לעשות: לסמן cancel_at_period_end = true ו-auto_renew = false בחשבון.`
    );
  }
  return NextResponse.json({ ok: true, current_period_end: photographer.current_period_end });
}
