"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Spinner from "@/components/Spinner";

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 20;

// Back from PayPlus after buying extra assistant conversations. The conversations are added by the
// webhook, which can trail the redirect by a few seconds, so this polls until the purchase is paid.
function IntakeSuccess() {
  const purchase = useSearchParams().get("purchase") ?? "";
  const [state, setState] = useState<{ status: "waiting" | "paid" | "failed" | "slow"; conversations?: number; balance?: number; receiptLink?: string | null }>({ status: "waiting" });

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const res = await fetch(`/api/intake-credits/status?purchase=${encodeURIComponent(purchase)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "paid") return setState({ status: "paid", conversations: data.conversations, balance: data.balance, receiptLink: data.receiptLink });
        if (data.status === "failed") return setState({ status: "failed" });
      } catch {
        // transient, retry
      }
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) return setState({ status: "slow" });
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [purchase]);

  return (
    <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-card border border-line shadow-card">
      {state.status === "waiting" && (
        <>
          <h1 className="text-xl font-bold mb-2 font-display">התשלום התקבל</h1>
          <p className="text-sm text-ink-soft mb-5">טוען את השיחות לחשבון...</p>
          <div className="flex justify-center">
            <Spinner />
          </div>
        </>
      )}
      {state.status === "paid" && (
        <>
          <h1 className="text-xl font-bold mb-2 font-display">השיחות נטענו</h1>
          <p className="text-sm text-ink-soft mb-1">
            נוספו <span className="font-data font-semibold text-ink">{state.conversations}</span> שיחות לעוזר הפניות.
          </p>
          <p className="text-sm text-ink-soft mb-5">
            יש לך עכשיו <span className="font-data font-semibold text-ink">{state.balance}</span> שיחות נוספות, מעבר למכסה החודשית. הקבלה נשלחת למייל.
          </p>
          <Link href="/settings?tab=automation" className="block w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white">
            חזרה להגדרות העוזר
          </Link>
        </>
      )}
      {state.status === "failed" && (
        <>
          <h1 className="text-xl font-bold mb-2 font-display">התשלום לא עבר</h1>
          <p className="text-sm text-ink-soft mb-5">לא חויבת, ולא נטענו שיחות. אפשר לנסות שוב מההגדרות.</p>
          <Link href="/settings?tab=automation" className="block w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white">
            חזרה להגדרות העוזר
          </Link>
        </>
      )}
      {state.status === "slow" && (
        <>
          <h1 className="text-xl font-bold mb-2 font-display">התשלום התקבל</h1>
          <p className="text-sm text-ink-soft mb-5">הטעינה לוקחת קצת יותר זמן מהרגיל. השיחות יופיעו בהגדרות העוזר בדקות הקרובות.</p>
          <Link href="/settings?tab=automation" className="block w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white">
            להגדרות העוזר
          </Link>
        </>
      )}
    </div>
  );
}

export default function IntakeSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={<Spinner />}>
        <IntakeSuccess />
      </Suspense>
    </div>
  );
}
