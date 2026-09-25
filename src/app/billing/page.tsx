import Link from "next/link";
import { hasAppAccess, isInTrial, trialEnded, trialDaysLeft } from "@/lib/subscription";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Photographer } from "@/lib/types";
import BillingPlanSelector from "@/components/BillingPlanSelector";
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
  // An active trial can open this page too (the banner's "בחירת מסלול"), to pay before it ends.
  if (photographer.subscription_status === "active") {
    redirect("/");
  }
  if (hasAppAccess(photographer) && !isInTrial(photographer)) {
    redirect("/");
  }

  const isPastDue = photographer.subscription_status === "past_due";
  const isCanceled = photographer.subscription_status === "canceled";
  const inTrial = isInTrial(photographer);
  const ended = trialEnded(photographer);
  const daysLeft = trialDaysLeft(photographer);
  // During/after the trial `plan` holds the trial's Pro+ plan; pre-select what they picked at signup.
  const initialPlan: SubscriptionPlan =
    photographer.signup_plan && photographer.signup_plan in SUBSCRIPTION_PLANS
      ? (photographer.signup_plan as SubscriptionPlan)
      : photographer.plan;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-card border border-line shadow-card">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold font-display">
            {isPastDue ? "התשלום לא עבר" : isCanceled ? "המנוי בוטל" : ended ? "תקופת הניסיון הסתיימה" : inTrial ? "בחירת מסלול" : "השלמת ההרשמה"}
          </h1>
          <LogoutButton />
        </div>
        <p className="text-sm mb-4 text-ink-soft">
          {isPastDue
            ? "החיוב האחרון נכשל. יש לעדכן אמצעי תשלום כדי להמשיך להשתמש במערכת."
            : isCanceled
              ? "המנוי שלך בוטל. ניתן להפעיל אותו מחדש בכל עת."
              : ended
                ? "תודה שניסיתם את גילברטו. כל האירועים, הגלריות והלקוחות שהכנסתם שמורים 30 יום מסוף הניסיון, ואחר כך נמחקים. בוחרים מסלול, ומשם ממשיכים בדיוק מאיפה שעצרתם."
                : inTrial
                  ? `נשארו ${daysLeft} ימים לתקופת הניסיון. אפשר לבחור מסלול כבר עכשיו. החיוב הראשון מתבצע ביום התשלום.`
                  : "כדי להתחיל להשתמש במערכת יש להשלים את התשלום עבור המנוי שנבחר."}
        </p>
        {error === "1" && (
          <p className="text-xs text-rose mb-4">התשלום לא הושלם או נכשל. ניתן לנסות שוב.</p>
        )}
        <BillingPlanSelector initialPlan={initialPlan} />
        {inTrial && (
          <Link href="/" className="block text-center text-sm text-ink-soft underline underline-offset-2 mt-4">
            חזרה למערכת
          </Link>
        )}
      </div>
    </div>
  );
}
