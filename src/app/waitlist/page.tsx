import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CustomPackageRow, Photographer, WaitlistRow } from "@/lib/types";
import WaitlistView from "@/components/WaitlistView";

export default async function WaitlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: photographer }, { data: entries }, { data: customPackages }] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    supabase.from("waitlist").select("*").order("requested_date", { ascending: true }).returns<WaitlistRow[]>(),
    supabase.from("custom_packages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageRow[]>(),
  ]);
  if (!photographer) redirect("/");

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <WaitlistView initialEntries={entries ?? []} customPackages={customPackages ?? []} />
    </div>
  );
}
