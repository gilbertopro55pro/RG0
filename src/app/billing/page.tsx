import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import type { Photographer } from "@/lib/types";
import BillingCheckoutButton from "@/components/BillingCheckoutButton";
import LogoutButton from "@/components/LogoutButton";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: photographer } = await supabase
    .from("photographers")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Photographer>();
  if (!photographer) redirect("/");
  if (photographer.subscription_status === "active" || photographer.subscription_status === "trialing") {
    redirect("/");
  }

  const plan = SUBSCRIPTION_PLANS[photographer.plan];
  const isPastDue = photographer.subscription_status === "past_due";
  const isCanceled = photographer.subscription_status === "canceled";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-card border border-line shadow-card">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold font-display">
            {isPastDue ? "התשלום לא עבר" : isCanceled ? "המנוי בוטל" : "השלמת ההרשמה"}
          </h1>
          <LogoutButton />
        </div>
        <p className="text-sm mb-4 text-ink-soft">
          {isPastDue
            ? "החיוב האחרון נכשל — יש לעדכן אמצעי תשלום כדי להמשיך להשתמש במערכת."
            : isCanceled
              ? "המנוי שלך בוטל. ניתן להפעיל אותו מחדש בכל עת."
              : "כדי להתחיל להשתמש במערכת יש להשלים את התשלום עבור המנוי שנבחר."}
        </p>
        {error === "1" && (
          <p className="text-xs text-rose mb-4">התשלום לא הושלם או נכשל — ניתן לנסות שוב.</p>
        )}
        <div className="rounded-2xl p-4 relative mb-5 bg-white border-[1.5px] border-amber shadow-card">
          {plan.badge && (
            <span className="absolute -top-2.5 left-4 text-[10px] px-2 py-0.5 rounded-full tracking-wide bg-amber text-white">
              {plan.badge}
            </span>
          )}
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-display">₪{plan.pricePerMonth}</span>
            <span className="text-xs text-ink-soft">/ לחודש</span>
          </div>
          <div className="text-[11px] mt-1 text-ink-soft">{plan.note}</div>
        </div>
        <BillingCheckoutButton plan={photographer.plan} />
      </div>
    </div>
  );
}
