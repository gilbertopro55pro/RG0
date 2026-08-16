"use client";

import { useState } from "react";
import type { EventContractRow } from "@/lib/types";
import SignaturePad from "@/components/SignaturePad";

// The full contract text is one signed string (so nothing is hidden from what's actually agreed
// to), but the long itemized clauses (ד–טז) are only useful to read on demand — this splits the
// text around the "לפירוט המלא" / "4. אישור וחתימה" markers so they render inside a native
// <details> disclosure instead of the client having to scroll past them to reach the signature.
function splitContractText(text: string): { main: string; details: string; rest: string } {
  const detailsMarker = "לפירוט המלא";
  const signatureMarker = "4. אישור וחתימה";
  const detailsIdx = text.indexOf(detailsMarker);
  const signatureIdx = text.indexOf(signatureMarker);
  if (detailsIdx === -1 || signatureIdx === -1 || signatureIdx < detailsIdx) {
    return { main: text, details: "", rest: "" };
  }
  return {
    main: text.slice(0, detailsIdx).trim(),
    details: text.slice(detailsIdx + detailsMarker.length, signatureIdx).trim(),
    rest: text.slice(signatureIdx),
  };
}

export default function ContractSignForm({ contract: initialContract }: { contract: EventContractRow }) {
  const [contract, setContract] = useState(initialContract);
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { main, details, rest } = splitContractText(contract.contract_text);

  const sign = async () => {
    if (!signerName.trim() || !agreed || !signatureDataUrl) return;
    setSigning(true);
    setError(null);
    const res = await fetch(`/api/contracts/${contract.sign_token}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signerName, signatureDataUrl }),
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
      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card text-sm leading-relaxed">
        <div className="whitespace-pre-wrap">{main}</div>
        {details && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-amber-deep select-none">
              לפירוט המלא
            </summary>
            <div className="whitespace-pre-wrap mt-2 pt-2 border-t border-line">{details}</div>
          </details>
        )}
        {rest && <div className="whitespace-pre-wrap mt-3">{rest}</div>}
      </div>

      {contract.status === "signed" ? (
        <div className="rounded-xl px-3.5 py-4 text-sm bg-sage-bg text-sage text-center space-y-3">
          <div>
            החוזה נחתם ✓ על ידי {contract.signer_name} בתאריך{" "}
            {contract.signed_at && new Date(contract.signed_at).toLocaleDateString("he-IL")}
          </div>
          {contract.signature_data_url && (
            // eslint-disable-next-line @next/next/no-img-element -- a locally-drawn data URL, no benefit from next/image's remote optimization
            <img src={contract.signature_data_url} alt="חתימה" className="mx-auto h-20 rounded-lg border border-line bg-white" />
          )}
        </div>
      ) : (
        <div className="rounded-2xl p-4 bg-card border border-line shadow-card space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שם מלא</label>
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">חתימה (חתמו עם האצבע או העכבר)</label>
            <SignaturePad onChange={setSignatureDataUrl} />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            קראתי את תנאי ההסכם ואני מסכים/ה לתוכנו
          </label>
          {error && <p className="text-xs text-rose">{error}</p>}
          <button
            onClick={sign}
            disabled={!signerName.trim() || !agreed || !signatureDataUrl || signing}
            className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
          >
            {signing ? "חותם..." : "חתימה על החוזה"}
          </button>
        </div>
      )}
    </div>
  );
}
