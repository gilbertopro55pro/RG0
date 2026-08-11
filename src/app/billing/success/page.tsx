"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Spinner from "@/components/Spinner";

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 20; // ~30s — the webhook normally lands within a second or two

export default function BillingSuccessPage() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const res = await fetch("/api/payplus/status");
        const data = await res.json();
        if (cancelled) return;
        if (data.active) {
          router.push("/");
          router.refresh();
          return;
        }
      } catch {
        // transient — retry on the next tick
      }
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        setTimedOut(true);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-card border border-line shadow-card">
        <h1 className="text-xl font-bold mb-2 font-display">התשלום התקבל 🎉</h1>
        {timedOut ? (
          <>
            <p className="text-sm text-ink-soft mb-5">
              עדכון החשבון לוקח קצת יותר זמן מהרגיל. אפשר להמתין עוד רגע ולרענן את הדף, או לעבור
              לדאשבורד ישירות.
            </p>
            <Link href="/" className="block w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white">
              מעבר לדאשבורד
            </Link>
          </>
        ) : (
          <p className="text-sm text-ink-soft mb-1 flex items-center justify-center gap-2">
            <Spinner /> מעדכנים את החשבון שלך...
          </p>
        )}
      </div>
    </div>
  );
}
