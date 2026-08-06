"use client";

import { useState } from "react";
import type { EventContractRow } from "@/lib/types";

export default function ContractSignForm({ contract: initialContract }: { contract: EventContractRow }) {
  const [contract, setContract] = useState(initialContract);
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sign = async () => {
    if (!signerName.trim() || !agreed) return;
    setSigning(true);
    setError(null);
    const res = await fetch(`/api/contracts/${contract.sign_token}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signerName }),
    });
    const data = await res.json();
    setSigning(false);
    if (!res.ok) {
      setError(data.error ?? "שגיאה בחתימת החוזה");
      return;
    }
    setContract(data.contract);
  };

  return (
    <div>
      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card whitespace-pre-wrap text-sm leading-relaxed">
        {contract.contract_text}
      </div>

      {contract.status === "signed" ? (
        <div className="rounded-xl px-3.5 py-4 text-sm bg-sage-bg text-sage text-center">
          החוזה נחתם ✓ על ידי {contract.signer_name} בתאריך{" "}
          {contract.signed_at && new Date(contract.signed_at).toLocaleDateString("he-IL")}
        </div>
      ) : (
        <div className="rounded-2xl p-4 bg-card border border-line shadow-card space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שם מלא (מהווה חתימה אלקטרונית)</label>
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            קראתי את תנאי ההסכם ואני מסכים/ה לתוכנו
          </label>
          {error && <p className="text-xs text-rose">{error}</p>}
          <button
            onClick={sign}
            disabled={!signerName.trim() || !agreed || signing}
            className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
          >
            {signing ? "חותם..." : "חתימה על החוזה"}
          </button>
        </div>
      )}
    </div>
  );
}
