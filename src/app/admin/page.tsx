import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { Photographer } from "@/lib/types";
import AdminDashboardView from "@/components/AdminDashboardView";
import { recurringAmounts } from "@/lib/recurringCharges";

export type AdminPhotographerRow = Pick<
  Photographer,
  "id" | "name" | "email" | "plan" | "subscription_status" | "created_at" | "current_period_end" | "cancel_at_period_end" | "pending_plan" | "pending_plan_effective_at"
> & {
  has_recurring: boolean;
  /** What the standing order on file charges per cycle (its last charge), when known. */
  recurring_amount: number | null;
};

export default async function AdminPage() {
  const user = await getSessionUser();

  if (!user || user.email !== ADMIN_EMAIL) redirect("/");

  // Service-role client — this page shows every photographer account, not just the caller's own
  // row, so it deliberately bypasses the per-photographer RLS policies.
  const serviceRole = createServiceRoleClient();
  const { data: photographers } = await serviceRole
    .from("photographers")
    .select("id, name, email, plan, subscription_status, created_at, current_period_end, cancel_at_period_end, pending_plan, pending_plan_effective_at, payplus_recurring_uid")
    .order("created_at", { ascending: false })
    .returns<(Omit<AdminPhotographerRow, "has_recurring" | "recurring_amount"> & { payplus_recurring_uid: string | null })[]>();
  const amounts = await recurringAmounts(serviceRole, photographers ?? []);

  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <AdminDashboardView
        photographers={(photographers ?? []).map(({ payplus_recurring_uid, ...p }) => ({
          ...p,
          has_recurring: !!payplus_recurring_uid,
          recurring_amount: amounts.get(p.id) ?? null,
        }))}
      />
    </div>
  );
}
