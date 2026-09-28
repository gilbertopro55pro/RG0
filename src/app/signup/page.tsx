"use client";

import { useState } from "react";
import Link from "next/link";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import Spinner from "@/components/Spinner";

const selectArrowStyle = {
  background:
    "#ffffff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238f6f2f' stroke-width='1.5' fill='none' fill-rule='evenodd'/%3E%3C/svg%3E\") left 0.9rem center/10px 6px no-repeat",
};

// Signup is the bridge between the landing page and the app (design 2026-09-28): mostly the
// landing/login look (.landing-2026 tokens, navy brand side, brass button), leaning a little toward
// the app — a narrower brand side, the form in a soft white card on cool grey, small radii.
const inputClass =
  "w-full h-12 rounded-[6px] px-3.5 text-base border border-[var(--l-line)] bg-white text-[var(--l-ink)] focus:outline-none focus:border-[var(--l-ink)]";
const labelClass = "text-sm font-semibold block mb-1.5";
const primaryButtonClass =
  "w-full h-14 rounded-[6px] text-lg font-bold bg-[var(--l-accent)] text-[var(--l-on-accent)] disabled:opacity-60 flex items-center justify-center gap-2";
const cardClass =
  "w-full max-w-[440px] rounded-[14px] bg-white border border-[var(--l-line)] p-6 sm:p-8 shadow-[0_1px_2px_rgba(11,18,32,0.04),0_12px_32px_rgba(11,18,32,0.07)]";

function SignupShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-2026 min-h-screen flex flex-col lg:flex-row">
      <aside className="bg-[var(--l-navy)] text-[var(--l-on-navy)] px-5 sm:px-8 lg:px-12 py-6 lg:py-14 lg:w-[38%] flex flex-col justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 text-[var(--l-on-navy)] w-fit">
          <span className="w-9 h-9 rounded-[8px] bg-[var(--l-accent)] text-[var(--l-on-accent)] flex items-center justify-center">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <span className="font-display text-[21px] font-bold tracking-tight">גילברטו</span>
        </Link>
        <div className="hidden lg:flex flex-col gap-6">
          <div className="flex items-center gap-2.5 text-[15px] text-[var(--l-on-navy-soft)]">
            <span className="w-2 h-2 rounded-[2px] bg-[var(--l-accent)]" />
            מערכת ניהול לצלמי אירועים
          </div>
          <p className="font-display m-0 text-[56px] leading-[1] font-bold tracking-[-0.035em] text-white">
            פחות ניהול.
            <br />
            יותר צילום.
          </p>
          <p className="m-0 text-lg leading-relaxed text-[var(--l-on-navy-soft)] max-w-[380px]">
            14 יום ניסיון חינם, בלי כרטיס אשראי. כל האפשרויות של פרו+ פתוחות.
          </p>
        </div>
        <p className="hidden lg:block m-0 text-sm text-[var(--l-on-navy-mute)]">
          © {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט, צילום אירועים
        </p>
      </aside>

      <main className="flex-1 bg-[var(--l-bg-alt)] flex flex-col items-center justify-start lg:justify-center px-4 sm:px-8 py-8 lg:py-14">
        {children}
        <p className="lg:hidden text-center text-xs text-[var(--l-ink-soft)] mt-8">
          © {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט, צילום אירועים
        </p>
      </main>
    </div>
  );
}

export default function SignupPage() {
  const [step, setStep] = useState<"plan" | "details">("plan");
  const [plan, setPlan] = useState<SubscriptionPlan>("annual");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  // Runs server-side (via the admin API) rather than the client-side supabase.auth.signUp() this
  // replaced — see src/app/api/auth/signup/route.ts for why: it lets the account start
  // unconfirmed WITHOUT Supabase sending its own confirmation email (that one depended on
  // Supabase's mailer, which had real deliverability problems even pointed at our own SMTP), and
  // it surfaces a real "email already registered" error instead of signUp()'s deliberately vague
  // response. Confirmation happens by clicking the link in the login-details email instead of a
  // separate email — one less email that has to arrive for signup to work at all.
  const submit = async () => {
    if (!name || !phone || !email || !password) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, email, password, plan }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "ההרשמה נכשלה");
      return;
    }
    setAwaitingConfirmation(true);
  };

  if (awaitingConfirmation) {
    return (
      <SignupShell>
        <div className={`${cardClass} text-center`}>
          <h1 className="font-display m-0 mb-3 text-[26px] lg:text-[30px] leading-[1.1] font-bold tracking-[-0.02em]">
            כמעט סיימנו: נדרש אימות מייל
          </h1>
          <p className="m-0 mb-4 text-base leading-relaxed text-[var(--l-ink-soft)]">
            שלחנו מייל אימות לכתובת <span className="font-semibold text-[var(--l-ink)]">{email}</span>. יש ללחוץ על
            הקישור שבתוך המייל כדי לאמת את הכתובת. רק לאחר האימות ניתן יהיה להתחבר למערכת.
          </p>
          <p className="m-0 text-sm text-[var(--l-ink-soft)]">
            לא רואים את המייל תוך דקה-שתיים? בדקו גם בתיקיית הספאם / קידומי מכירות.
          </p>
        </div>
      </SignupShell>
    );
  }

  return (
    <SignupShell>
      <div className={cardClass}>
        <h1 className="font-display m-0 mb-6 text-[30px] lg:text-[36px] leading-[1.05] font-bold tracking-[-0.03em]">
          {step === "plan" ? "הרשמה למערכת" : "פרטי הצלם"}
        </h1>

        {step === "plan" && (
          <>
            <div className="rounded-[6px] px-4 py-3 mb-5 bg-[var(--l-bg-alt)] border-r-[3px] border-[var(--l-accent)]">
              <div className="text-[15px] font-bold text-[var(--l-accent)]">
                14 הימים הראשונים בחינם, בלי כרטיס אשראי
              </div>
              <div className="text-sm mt-1 leading-relaxed text-[var(--l-ink-soft)]">
                בזמן הניסיון כל האפשרויות של מסלול פרו+ פתוחות. לפני הסוף נזכיר לכם לבחור מסלול.
              </div>
            </div>
            <div className="mb-5">
              <label htmlFor="signup-plan" className={labelClass}>
                המסלול שתרצו אחרי הניסיון (אפשר לשנות בהמשך)
              </label>
              <select
                id="signup-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
                className={`${inputClass} appearance-none font-medium`}
                style={selectArrowStyle}
              >
                {Object.entries(SUBSCRIPTION_PLANS).map(([key, p]) => (
                  <option key={key} value={key}>
                    מנוי {p.label}: ₪{p.pricePerMonth}/חודש
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-[10px] p-4 relative mb-6 bg-white border-[1.5px] border-[var(--l-accent)]">
              {SUBSCRIPTION_PLANS[plan].badge && (
                <span className="absolute -top-2.5 left-4 text-[11px] font-semibold px-2 py-0.5 rounded-[4px] bg-[var(--l-accent)] text-[var(--l-on-accent)]">
                  {SUBSCRIPTION_PLANS[plan].badge}
                </span>
              )}
              <div className="flex items-baseline gap-1">
                <span className="font-display text-[28px] font-bold tracking-tight">
                  ₪{SUBSCRIPTION_PLANS[plan].pricePerMonth}
                </span>
                <span className="text-sm text-[var(--l-ink-soft)]">/ לחודש</span>
              </div>
              <div className="text-xs mt-1 text-[var(--l-ink-soft)]">{SUBSCRIPTION_PLANS[plan].note}</div>
            </div>
            <button onClick={() => setStep("details")} className={primaryButtonClass}>
              התחלת תקופת הניסיון
            </button>
          </>
        )}

        {step === "details" && (
          <>
            <div className="rounded-[6px] px-4 py-3 mb-5 text-sm flex items-center justify-between gap-3 bg-[var(--l-bg-alt)] text-[var(--l-ink-soft)]">
              <span>
                אחרי הניסיון: {SUBSCRIPTION_PLANS[plan].label}, ₪{SUBSCRIPTION_PLANS[plan].pricePerMonth}/חודש
              </span>
              <button
                onClick={() => setStep("plan")}
                className="shrink-0 font-semibold text-[var(--l-accent)] underline underline-offset-4"
              >
                שינוי
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="signup-name" className={labelClass}>
                  שם מלא
                </label>
                <input
                  id="signup-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="signup-phone" className={labelClass}>
                  טלפון (ממנו יישלחו העדכונים ללקוחות)
                </label>
                <input
                  id="signup-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="050-1234567"
                />
              </div>
              <div>
                <label htmlFor="signup-email" className={labelClass}>
                  אימייל
                </label>
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="signup-password" className={labelClass}>
                  סיסמה
                </label>
                <input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              {error && <p className="m-0 text-sm text-rose">{error}</p>}
              <button onClick={submit} disabled={loading} className={`${primaryButtonClass} mt-2`}>
                {loading && <Spinner light />}
                {loading ? "יוצר חשבון..." : "יצירת חשבון"}
              </button>
            </div>
          </>
        )}

        <p className="m-0 mt-6 text-center text-base text-[var(--l-ink-soft)]">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="font-semibold text-[var(--l-accent)] underline underline-offset-4">
            התחברות
          </Link>
        </p>
      </div>
    </SignupShell>
  );
}
