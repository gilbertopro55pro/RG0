import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CustomPackageRow, LeadRow, Photographer } from "@/lib/types";
import LeadsView from "@/components/LeadsView";

export default async function LeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: photographer }, { data: leads }, { data: customPackages }] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    supabase.from("leads").select("*").order("created_at", { ascending: false }).returns<LeadRow[]>(),
    supabase.from("custom_packages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageRow[]>(),
  ]);
  if (!photographer) redirect("/");

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <LeadsView initialLeads={leads ?? []} customPackages={customPackages ?? []} />
    </div>
  );
}
