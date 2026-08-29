"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";

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
      setError(signInError.message);
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <Image
        src="/icons/icon-192.png"
        alt="לוגו המערכת"
        width={72}
        height={72}
        className="rounded-2xl shadow-card mb-5"
        priority
      />
      <div className="w-full max-w-sm rounded-2xl p-5 bg-card border border-line shadow-card">
        <h1 className="text-xl font-bold mb-5 font-display">התחברות</h1>
        {justConfirmed && (
          <p className="text-sm text-sage font-medium mb-4 -mt-2">המייל אומת בהצלחה — אפשר להתחבר.</p>
        )}
        {confirmError && (
          <p className="text-sm text-rose font-medium mb-4 -mt-2">
            קישור האימות לא תקין או פג תוקף. נסו להירשם שוב או פנו לתמיכה.
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">סיסמה</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full rounded-lg px-3 py-2 pl-10 text-sm border border-line"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink"
                aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6 0 9.5 5.5 9.9 6.5-.19.5-1.2 2.4-3 4M6.3 6.3C3.7 8 2.3 10.8 2.1 11.5c.4 1 3.9 6.5 9.9 6.5.9 0 1.7-.13 2.5-.35" />
                    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.1 11.5C2.5 10.5 6 5 12 5s9.5 5.5 9.9 6.5c-.4 1-3.9 6.5-9.9 6.5S2.5 12.5 2.1 11.5Z" />
                    <circle cx="12" cy="11.5" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-rose">{error}</p>}
          <button
            onClick={submit}
            disabled={loading}
            className="w-full rounded-xl py-3 text-sm font-semibold mt-2 bg-ink text-white disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Spinner light />}
            {loading ? "מתחבר..." : "התחברות"}
          </button>
          <button onClick={openForgotPassword} className="w-full text-center text-xs text-ink-soft underline">
            שכחתי סיסמה
          </button>
        </div>
        <p className="text-xs text-ink-soft text-center mt-5">
          עדיין אין לך חשבון?{" "}
          <Link href="/signup" className="text-amber-deep underline">
            הרשמה
          </Link>
        </p>
      </div>
      <p className="text-center text-[11px] text-ink-soft mt-5">
        © {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט — צילום אירועים
      </p>

      {showForgotPassword && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setShowForgotPassword(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-display">איפוס סיסמה</h2>
              <button
                onClick={() => setShowForgotPassword(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
              >
                ✕
              </button>
            </div>

            {resetSent ? (
              <p className="text-sm text-sage font-medium">
                אם קיים חשבון עם הכתובת הזו, נשלח אליה מייל עם קישור לאיפוס הסיסמה. בדקו גם בתיקיית הספאם.
              </p>
            ) : (
              <>
                <p className="text-xs text-ink-soft mb-3">
                  הזינו את כתובת המייל של החשבון, ונשלח אליכם קישור לבחירת סיסמה חדשה.
                </p>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendResetLink()}
                  placeholder="example@gmail.com"
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-3"
                />
                {resetError && <p className="text-xs text-rose mb-3">{resetError}</p>}
                <button
                  onClick={sendResetLink}
                  disabled={resetSending || !resetEmail}
                  className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
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
