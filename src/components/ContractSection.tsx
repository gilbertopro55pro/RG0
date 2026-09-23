"use client";

import { useState } from "react";
import type { EventContractRow } from "@/lib/types";
import { useModalEntered } from "@/lib/useModalEntered";
import { IconClose } from "@/components/icons/AlbumIcons";

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
  const [showPreview, setShowPreview] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const previewEntered = useModalEntered();

  const openEdit = () => {
    if (!contract) return;
    setEditText(contract.contract_text);
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/contract`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractText: editText }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "שגיאה בשמירת החוזה");
      return;
    }
    setContract(data.contract);
    setShowEdit(false);
  };

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
          <div className="flex gap-2">
            <button
              onClick={() => setShowPreview(true)}
              className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
            >
              👁 תצוגה מקדימה
            </button>
            <button
              onClick={openEdit}
              className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
            >
              ✎ עריכה
            </button>
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
        <div className="space-y-2.5">
          <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">
            נחתם ✓ על ידי {contract.signer_name}
            {contract.signed_at && ` · ${new Date(contract.signed_at).toLocaleDateString("he-IL")}`}
          </div>
          {contract.signature_data_url && (
            // eslint-disable-next-line @next/next/no-img-element -- a stored data URL, no benefit from next/image's remote optimization
            <img src={contract.signature_data_url} alt="חתימת הלקוח" className="h-16 rounded-lg border border-line bg-white" />
          )}
          <button
            onClick={() => setShowPreview(true)}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
          >
            👁 תצוגה מקדימה
          </button>
        </div>
      )}

      {error && <p className="text-xs text-rose mt-2">{error}</p>}

      {showPreview && contract && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{
            background: "rgba(46,49,66,0.45)",
            backdropFilter: previewEntered ? "blur(16px)" : "blur(0px)",
            WebkitBackdropFilter: previewEntered ? "blur(16px)" : "blur(0px)",
            transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
          }}
          onClick={() => setShowPreview(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-display">תצוגה מקדימה — חוזה הזמנה</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed rounded-xl p-3.5 bg-chip">
              {contract.contract_text}
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setShowEdit(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-display">עריכת החוזה</h2>
              <button
                onClick={() => setShowEdit(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-ink-soft mb-2.5">שינויים כאן נשמרים ישירות על החוזה, ולא נוצרים מחדש מהפרטים של האירוע.</p>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={16}
              className="w-full flex-1 rounded-xl p-3.5 text-sm border border-line bg-white font-data leading-relaxed resize-none"
              dir="rtl"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {saving ? "שומר..." : "שמירת שינויים"}
              </button>
              <button
                onClick={() => setShowEdit(false)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
