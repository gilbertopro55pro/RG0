"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import Spinner from "@/components/Spinner";

const selectArrowStyle = {
  background:
    "var(--color-amber-bg) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236169C4' stroke-width='1.5' fill='none' fill-rule='evenodd'/%3E%3C/svg%3E\") left 0.9rem center/10px 6px no-repeat",
};

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"plan" | "details">("plan");
  const [plan, setPlan] = useState<SubscriptionPlan>("annual");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const submit = async () => {
    if (!name || !phone || !email || !password) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, phone, plan } },
    });
    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }
    if (data.session) {
      router.push("/");
      router.refresh();
    } else {
      setLoading(false);
      setAwaitingConfirmation(true);
    }
  };

  if (awaitingConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-card border border-line shadow-card">
          <h1 className="text-xl font-bold mb-2 font-display">כמעט סיימנו</h1>
          <p className="text-sm text-ink-soft">
            שלחנו לך מייל אישור ל-{email}. לחצו על הקישור במייל כדי להשלים את ההרשמה ולהתחבר.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-card border border-line shadow-card">
        <h1 className="text-xl font-bold mb-5 font-display">
          {step === "plan" ? "הרשמה למערכת" : "פרטי הצלם"}
        </h1>

        {step === "plan" && (
          <>
            <p className="text-sm mb-4 text-ink-soft">
              מנוי אחד לכל היכולות של המערכת — ניהול אירועים, מעקב שלבים ועדכוני לקוחות אוטומטיים.
            </p>
            <div className="mb-4">
              <label className="text-xs block mb-1.5 text-ink-soft">בחר/י מסלול תשלום</label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
                className="w-full rounded-lg px-3 py-2.5 text-sm appearance-none font-medium text-ink border border-line"
                style={selectArrowStyle}
              >
                {Object.entries(SUBSCRIPTION_PLANS).map(([key, p]) => (
                  <option key={key} value={key}>
                    מנוי {p.label} — ₪{p.pricePerMonth}/חודש
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl p-4 relative mb-5 bg-white border-[1.5px] border-amber shadow-card">
              {SUBSCRIPTION_PLANS[plan].badge && (
                <span className="absolute -top-2.5 left-4 text-[10px] px-2 py-0.5 rounded-full tracking-wide bg-amber text-white">
                  {SUBSCRIPTION_PLANS[plan].badge}
                </span>
              )}
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-display">
                  ₪{SUBSCRIPTION_PLANS[plan].pricePerMonth}
                </span>
                <span className="text-xs text-ink-soft">/ לחודש</span>
              </div>
              <div className="text-[11px] mt-1 text-ink-soft">{SUBSCRIPTION_PLANS[plan].note}</div>
            </div>
            <button
              onClick={() => setStep("details")}
              className="w-full rounded-xl py-3 text-sm font-semibold bg-amber-deep text-white"
            >
              המשך להרשמה
            </button>
          </>
        )}

        {step === "details" && (
          <>
            <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs flex items-center justify-between bg-[#F1EFE9] text-ink-soft">
              <span>
                נבחר: מנוי {SUBSCRIPTION_PLANS[plan].label} · ₪{SUBSCRIPTION_PLANS[plan].pricePerMonth}/חודש
              </span>
              <button onClick={() => setStep("plan")} className="underline text-amber-deep">
                שינוי
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1 text-ink-soft">שם מלא</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line"
                />
              </div>
              <div>
                <label className="text-xs block mb-1 text-ink-soft">
                  טלפון (ממנו יישלחו העדכונים ללקוחות)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line font-data"
                  placeholder="050-1234567"
                />
              </div>
              <div>
                <label className="text-xs block mb-1 text-ink-soft">אימייל</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line"
                />
              </div>
              <div>
                <label className="text-xs block mb-1 text-ink-soft">סיסמה</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line"
                />
              </div>
              {error && <p className="text-xs text-rose">{error}</p>}
              <button
                onClick={submit}
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm font-semibold mt-2 bg-ink text-white disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Spinner light />}
                {loading ? "יוצר חשבון..." : "יצירת חשבון"}
              </button>
            </div>
          </>
        )}

        <p className="text-xs text-ink-soft text-center mt-5">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="text-amber-deep underline">
            התחברות
          </Link>
        </p>
      </div>
    </div>
  );
}
