import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { CustomPackageRow, EventTypeRow, LeadRow, PackagePriceRow, Photographer } from "@/lib/types";
import LeadsView from "@/components/LeadsView";
import { hasAppAccess } from "@/lib/subscription";

export default async function LeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: photographer }, { data: leads }, { data: customPackages }, { data: eventTypes }, { data: prices }] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    supabase.from("leads").select("*").order("created_at", { ascending: false }).returns<LeadRow[]>(),
    supabase.from("custom_packages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageRow[]>(),
    supabase.from("event_types").select("*").order("sort_order", { ascending: true }).returns<EventTypeRow[]>(),
    supabase.from("package_prices").select("*").returns<PackagePriceRow[]>(),
  ]);
  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <LeadsView
        initialLeads={leads ?? []}
        customPackages={customPackages ?? []}
        eventTypes={eventTypes ?? []}
        prices={prices ?? []}
        isAdmin={photographer.email === ADMIN_EMAIL}
      />
    </div>
  );
}
