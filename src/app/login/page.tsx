"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-card border border-line shadow-card">
        <h1 className="text-xl font-bold mb-5 font-display">התחברות</h1>
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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
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
            {loading ? "מתחבר..." : "התחברות"}
          </button>
        </div>
        <p className="text-xs text-ink-soft text-center mt-5">
          עדיין אין לך חשבון?{" "}
          <Link href="/signup" className="text-amber-deep underline">
            הרשמה
          </Link>
        </p>
      </div>
    </div>
  );
}
