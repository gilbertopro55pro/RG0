import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, Photographer } from "@/lib/types";
import ClientPortalsView from "@/components/ClientPortalsView";

export default async function ClientPortalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: photographer }, { data: events }] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    supabase
      .from("events")
      .select("*, custom_packages(name)")
      .order("event_date", { ascending: false })
      .returns<(EventRow & { custom_packages: { name: string } | null })[]>(),
  ]);
  if (!photographer) redirect("/");

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <ClientPortalsView events={events ?? []} />
    </div>
  );
}
