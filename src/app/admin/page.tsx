import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { Photographer } from "@/lib/types";
import AdminDashboardView from "@/components/AdminDashboardView";

export type AdminPhotographerRow = Pick<
  Photographer,
  "id" | "name" | "email" | "plan" | "subscription_status" | "created_at" | "current_period_end" | "cancel_at_period_end"
> & { has_recurring: boolean };

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) redirect("/");

  // Service-role client — this page shows every photographer account, not just the caller's own
  // row, so it deliberately bypasses the per-photographer RLS policies.
  const serviceRole = createServiceRoleClient();
  const { data: photographers } = await serviceRole
    .from("photographers")
    .select("id, name, email, plan, subscription_status, created_at, current_period_end, cancel_at_period_end, payplus_recurring_uid")
    .order("created_at", { ascending: false })
    .returns<(Omit<AdminPhotographerRow, "has_recurring"> & { payplus_recurring_uid: string | null })[]>();

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <AdminDashboardView
        photographers={(photographers ?? []).map(({ payplus_recurring_uid, ...p }) => ({ ...p, has_recurring: !!payplus_recurring_uid }))}
      />
    </div>
  );
}
