"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import { IconClose } from "@/components/icons/AlbumIcons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Plain URLSearchParams off window.location rather than next/navigation's useSearchParams —
  // that hook requires wrapping the page in a Suspense boundary to avoid a build error, which
  // isn't worth the restructuring for a one-off "you just confirmed your email" banner.
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJustConfirmed(params.get("confirmed") === "1");
    setConfirmError(params.get("confirm_error") === "1");
  }, []);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      setError(loginErrorMessage(signInError.message));
      return;
    }
    router.push("/");
    router.refresh();
  };

  const openForgotPassword = () => {
    setResetEmail(email);
    setResetSent(false);
    setResetError(null);
    setShowForgotPassword(true);
  };

  const sendResetLink = async () => {
    if (!resetEmail) return;
    setResetSending(true);
    setResetError(null);
    const supabase = createClient();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetSending(false);
    if (resetErr) {
      setResetError(resetErr.message);
      return;
    }
    setResetSent(true);
  };

  // Same look as the landing page (design 2026-09-28): .landing-2026 tokens, a navy brand side and
  // the form on white, brass accent, square corners.
  const inputClass =
    "w-full h-12 rounded-[1px] px-3.5 text-base border border-[var(--l-line)] bg-white text-[var(--l-ink)] focus:outline-none focus:border-[var(--l-ink)]";

  return (
    <div className="landing-2026 min-h-screen flex flex-col lg:flex-row">
      <aside className="bg-[var(--l-navy)] text-[var(--l-on-navy)] px-5 sm:px-8 lg:px-16 py-6 lg:py-14 lg:w-[46%] flex flex-col justify-between gap-6">
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
          <p className="font-display m-0 text-[72px] leading-[0.98] font-bold tracking-[-0.035em] text-white">
            פחות ניהול.
            <br />
            יותר צילום.
          </p>
          <p className="m-0 text-lg leading-relaxed text-[var(--l-on-navy-soft)] max-w-[440px]">
            לידים, חוזים, תשלומים, גלריות ואלבומים במקום אחד, והצעד הבא בכל אירוע מחכה לכם מוכן.
          </p>
        </div>
        <p className="hidden lg:block m-0 text-sm text-[var(--l-on-navy-mute)]">
          © {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט, צילום אירועים
        </p>
      </aside>

      <main className="flex-1 bg-[var(--l-bg)] flex flex-col items-center justify-start lg:justify-center px-5 sm:px-8 py-10 lg:py-14">
        <div className="w-full max-w-[400px]">
          <h1 className="font-display m-0 mb-2 text-[34px] lg:text-[44px] leading-[1.05] font-bold tracking-[-0.03em]">התחברות</h1>
          <p className="m-0 mb-8 text-base text-[var(--l-ink-soft)]">
            עדיין אין לכם חשבון?{" "}
            <Link href="/signup" className="font-semibold text-[var(--l-accent)] underline underline-offset-4">
              להתחיל 14 יום חינם
            </Link>
          </p>
          {justConfirmed && <p className="text-sm text-sage font-medium mb-5">המייל אומת בהצלחה. אפשר להתחבר.</p>}
          {confirmError && (
            <p className="text-sm text-rose font-medium mb-5">קישור האימות לא תקין או פג תוקף. נסו להירשם שוב או פנו לתמיכה.</p>
          )}
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="login-email" className="text-sm font-semibold block mb-1.5">
                אימייל
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="text-sm font-semibold block mb-1.5">
                סיסמה
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className={`${inputClass} pl-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-[var(--l-ink-soft)] hover:text-[var(--l-ink)]"
                  aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6 0 9.5 5.5 9.9 6.5-.19.5-1.2 2.4-3 4M6.3 6.3C3.7 8 2.3 10.8 2.1 11.5c.4 1 3.9 6.5 9.9 6.5.9 0 1.7-.13 2.5-.35" />
                      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.1 11.5C2.5 10.5 6 5 12 5s9.5 5.5 9.9 6.5c-.4 1-3.9 6.5-9.9 6.5S2.5 12.5 2.1 11.5Z" />
                      <circle cx="12" cy="11.5" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && <p className="m-0 text-sm text-rose">{error}</p>}
            <button
              onClick={submit}
              disabled={loading}
              className="w-full h-14 rounded-[1px] mt-2 text-lg font-bold bg-[var(--l-accent)] text-[var(--l-on-accent)] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Spinner light />}
              {loading ? "מתחבר..." : "התחברות"}
            </button>
            <button onClick={openForgotPassword} className="self-center text-sm text-[var(--l-ink-soft)] underline underline-offset-4 hover:text-[var(--l-ink)]">
              שכחתי סיסמה
            </button>
          </div>
          <p className="lg:hidden text-center text-xs text-[var(--l-ink-soft)] mt-10">
            © {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט, צילום אירועים
          </p>
        </div>
      </main>

      {showForgotPassword && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(11, 18, 32, 0.55)" }}
          onClick={() => setShowForgotPassword(false)}
        >
          <div className="w-full max-w-md p-6 pb-8 bg-white border-t sm:border border-[var(--l-line)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="m-0 font-display text-2xl font-bold tracking-tight">איפוס סיסמה</h2>
              <button
                onClick={() => setShowForgotPassword(false)}
                aria-label="סגירה"
                className="h-10 w-10 flex items-center justify-center border border-[var(--l-line)] rounded-[1px]"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            {resetSent ? (
              <p className="m-0 text-sm text-sage font-medium">
                אם קיים חשבון עם הכתובת הזו, נשלח אליה מייל עם קישור לאיפוס הסיסמה. בדקו גם בתיקיית הספאם.
              </p>
            ) : (
              <>
                <p className="m-0 mb-4 text-sm text-[var(--l-ink-soft)]">הזינו את כתובת המייל של החשבון, ונשלח אליכם קישור לבחירת סיסמה חדשה.</p>
                <input
                  type="email"
                  aria-label="אימייל לאיפוס"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendResetLink()}
                  placeholder="example@gmail.com"
                  className={`${inputClass} mb-3`}
                />
                {resetError && <p className="m-0 mb-3 text-sm text-rose">{resetError}</p>}
                <button
                  onClick={sendResetLink}
                  disabled={resetSending || !resetEmail}
                  className="w-full h-12 rounded-[1px] text-base font-bold bg-[var(--l-navy)] text-white disabled:opacity-60"
                >
                  {resetSending ? "שולח..." : "שליחת קישור לאיפוס"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Supabase Auth answers in English; the photographer sees Hebrew.
function loginErrorMessage(message: string): string {
  if (/email not confirmed/i.test(message)) {
    return "כתובת המייל עדיין לא אומתה. לחצו על הקישור במייל ששלחנו בהרשמה (כדאי לבדוק גם בספאם), ואז התחברו.";
  }
  if (/invalid login credentials/i.test(message)) return "המייל או הסיסמה לא נכונים.";
  if (/rate limit|too many/i.test(message)) return "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.";
  return "ההתחברות נכשלה. נסו שוב.";
}
