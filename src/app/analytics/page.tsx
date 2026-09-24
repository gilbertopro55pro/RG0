import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventPaymentRow, Photographer } from "@/lib/types";
import type { PackageType } from "@/lib/stages";
import AnalyticsView from "@/components/AnalyticsView";
import { hasAppAccess } from "@/lib/subscription";

export type AnalyticsEvent = {
  id: string;
  event_date: string;
  package: PackageType;
  client_name: string;
  closed_at: string | null;
  closed_balance_month: string | null;
};

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: photographer }, { data: events }, { data: payments }] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    supabase.from("events").select("id, event_date, package, client_name, closed_at, closed_balance_month").returns<AnalyticsEvent[]>(),
    supabase.from("event_payments").select("*").returns<EventPaymentRow[]>(),
  ]);
  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");

  // Computed once, server-side, and passed down rather than each side calling `new Date()`
  // independently — otherwise a server/client timezone difference causes a hydration mismatch.
  const now = new Date();

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <AnalyticsView
        events={events ?? []}
        payments={payments ?? []}
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth() + 1}
      />
    </div>
  );
}
