"use client";

import { useState } from "react";
import type { EventContractRow } from "@/lib/types";

export default function ContractSection({
  eventId,
  initialContract,
}: {
  eventId: string;
  initialContract: EventContractRow | null;
}) {
  const [contract, setContract] = useState(initialContract);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/contract`, { method: "POST" });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error ?? "שגיאה ביצירת החוזה");
      return;
    }
    setContract(data.contract);
  };

  const copyLink = async () => {
    if (!contract) return;
    const signLink = `${window.location.origin}/contracts/${contract.sign_token}`;
    await navigator.clipboard.writeText(signLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
      <div className="flex items-center gap-2 mb-3.5">
        <span className="text-sm font-semibold tracking-wide">חוזה הזמנה</span>
      </div>

      {!contract && (
        <button
          onClick={generate}
          disabled={generating}
          className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
        >
          {generating ? "יוצר..." : "צור חוזה לחתימה"}
        </button>
      )}

      {contract && contract.status !== "signed" && (
        <div className="space-y-2.5">
          <div className="rounded-xl px-3.5 py-2.5 text-sm bg-chip-tint text-amber-deep font-medium">
            ממתין לחתימת הלקוח/ה
          </div>
          <button
            onClick={copyLink}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
          >
            {copied ? "הקישור הועתק ✓" : "העתקת קישור לחתימה"}
          </button>
          <button onClick={generate} disabled={generating} className="w-full text-xs text-ink-soft underline">
            {generating ? "מרענן..." : "יצירת חוזה מעודכן (מחליף את הקיים)"}
          </button>
        </div>
      )}

      {contract && contract.status === "signed" && (
        <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">
          נחתם ✓ על ידי {contract.signer_name}
          {contract.signed_at && ` · ${new Date(contract.signed_at).toLocaleDateString("he-IL")}`}
        </div>
      )}

      {error && <p className="text-xs text-rose mt-2">{error}</p>}
    </div>
  );
}
