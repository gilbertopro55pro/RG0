import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";

// Admin dashboard › lock / unlock an account over a payment that didn't come through (owner's
// decision, 2026-09-29: locking is manual, never automatic). Locking sets past_due, which sends the
// account to /billing ("התשלום לא עבר" › עדכון אמצעי תשלום); paying there turns it active again
// through the PayPlus webhook, and cancels the old recurring. Unlocking just sets it back to active.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { photographerId, locked }: { photographerId?: string; locked?: boolean } = await request.json().catch(() => ({}));
  if (!photographerId || typeof locked !== "boolean") return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  // Only a paying account moves between the two: never touches a trial, a cancelled or an
  // incomplete account.
  const from = locked ? "active" : "past_due";
  const to = locked ? "past_due" : "active";
  const { data, error } = await createServiceRoleClient()
    .from("photographers")
    .update({ subscription_status: to })
    .eq("id", photographerId)
    .eq("subscription_status", from)
    .select("id, subscription_status")
    .maybeSingle<{ id: string; subscription_status: string }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: locked ? "אפשר לנעול רק חשבון במנוי פעיל" : "החשבון לא נעול" }, { status: 409 });
  return NextResponse.json({ status: data.subscription_status });
}
