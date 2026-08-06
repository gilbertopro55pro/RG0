"use client";

import { useState } from "react";
import type { SubscriptionPlan } from "@/lib/stages";
import Spinner from "@/components/Spinner";

export default function BillingCheckoutButton({ plan }: { plan: SubscriptionPlan }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/payplus/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "שגיאה ביצירת קישור לתשלום");
      setLoading(false);
      return;
    }
    window.location.href = data.url;
  };

  return (
    <div>
      <button
        onClick={startCheckout}
        disabled={loading}
        className="w-full rounded-xl py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && <Spinner light />}
        {loading ? "מעביר לתשלום..." : "מעבר לתשלום מאובטח"}
      </button>
      {error && <p className="text-xs text-rose mt-2">{error}</p>}
    </div>
  );
}
