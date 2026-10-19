import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventPaymentRow, Photographer } from "@/lib/types";
import type { PackageType } from "@/lib/stages";
import AnalyticsView from "@/components/AnalyticsView";
import { hasAppAccess } from "@/lib/subscription";
import { ADMIN_EMAIL } from "@/lib/admin";
import { PAYMENT_REMINDER_LOG_MARK } from "@/lib/paymentReminder";

export type AnalyticsEvent = {
  id: string;
  event_date: string;
  package: PackageType;
  client_name: string;
  closed_at: string | null;
  closed_balance_month: string | null;
  // For the payment reminder from the open balances tab (admin only for now).
  client_phone: string | null;
  client_email: string | null;
  client_access_token: string;
  client_lang: string | null;
};

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: photographer }, { data: events }, { data: payments }] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    supabase
      .from("events")
      .select("id, event_date, package, client_name, closed_at, closed_balance_month, client_phone, client_email, client_access_token, client_lang")
      .returns<AnalyticsEvent[]>(),
    supabase.from("event_payments").select("*").returns<EventPaymentRow[]>(),
  ]);
  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");

  // Computed once, server-side, and passed down rather than each side calling `new Date()`
  // independently — otherwise a server/client timezone difference causes a hydration mismatch.
  const now = new Date();
  // "Today" for which events already took place (the open-balances tab), on the Israel calendar.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);

  // The collection tools in the open balances tab: a payment reminder per client, admin only for
  // now (owner, 2026-10-19). The last reminder per event comes from the event log, which also has
  // the ones sent from the home screen's payment reminder prompt.
  const collection = photographer.email === ADMIN_EMAIL;
  const lastReminders: Record<string, string> = {};
  if (collection) {
    const { data: logged } = await supabase
      .from("event_notifications")
      .select("event_id, created_at")
      .ilike("text", `%${PAYMENT_REMINDER_LOG_MARK}%`)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<{ event_id: string | null; created_at: string }[]>();
    for (const r of logged ?? []) if (r.event_id && !lastReminders[r.event_id]) lastReminders[r.event_id] = r.created_at;
  }

  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <AnalyticsView
        events={events ?? []}
        payments={payments ?? []}
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth() + 1}
        today={today}
        initialTab={tab === "balances" ? "balances" : "overview"}
        collection={collection ? { lastReminders, signature: photographer.whatsapp_signature, senderName: photographer.name } : null}
      />
    </div>
  );
}
