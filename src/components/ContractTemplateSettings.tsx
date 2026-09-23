"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { defaultContractTerms } from "@/lib/contracts";
import type { Photographer } from "@/lib/types";

export default function ContractTemplateSettings({ photographer }: { photographer: Photographer }) {
  const supabase = createClient();
  const [mode, setMode] = useState<"default" | "custom">(photographer.custom_contract_terms ? "custom" : "default");
  const [terms, setTerms] = useState(photographer.custom_contract_terms ?? "");
  const [showDefaultPreview, setShowDefaultPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCustom = () => {
    // Deliberately empty, not pre-filled with the system default — every photographer's own
    // terms are different, so starting from someone else's clauses would just mean deleting them.
    setTerms("");
    setMode("custom");
  };

  const revertToDefault = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("photographers").update({ custom_contract_terms: null }).eq("id", photographer.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMode("default");
    setTerms("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const save = async () => {
    if (!terms.trim()) {
      setError("יש לכתוב את תנאי החוזה, או לחזור לתנאי ברירת המחדל");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("photographers").update({ custom_contract_terms: terms.trim() }).eq("id", photographer.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold mb-1">תבנית חוזה</div>
      <p className="text-xs text-ink-soft leading-relaxed mb-3.5">
        זהו הסעיף &quot;תנאים כלליים&quot; בחוזה שנוצר לכל אירוע, פרטי האירוע, התשלומים והחתימה נוצרים תמיד אוטומטית מתוך כרטיס
        האירוע ונשארים אותו דבר לכל הצלמים; רק הסעיף הזה הוא התנאים העסקיים שלכם, ואתם יכולים לכתוב אותו מחדש כרצונכם.
      </p>

      {mode === "default" ? (
        <div className="rounded-xl p-3 bg-chip">
          <p className="text-sm font-semibold mb-1">משתמשים בתנאים המומלצים של המערכת</p>
          <p className="text-xs text-ink-soft mb-2.5">אלו התנאים שמופיעים כברירת מחדל בכל חוזה שתיצרו, עד שתחליפו אותם בתנאים משלכם.</p>
          <button onClick={() => setShowDefaultPreview((v) => !v)} className="text-xs text-ink-soft underline mb-2.5">
            {showDefaultPreview ? "הסתרת התנאים המומלצים" : "צפייה בתנאים המומלצים"}
          </button>
          {showDefaultPreview && (
            <pre className="whitespace-pre-wrap text-xs text-ink-soft leading-relaxed rounded-lg p-2.5 bg-white border border-line mb-2.5 max-h-64 overflow-y-auto font-sans">
              {defaultContractTerms(photographer.name)}
            </pre>
          )}
          <button onClick={startCustom} className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white">
            כתיבת תנאים משלי
          </button>
        </div>
      ) : (
        <div className="rounded-xl p-3 bg-chip">
          <p className="text-sm font-semibold mb-2.5">התנאים שלי</p>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={10}
            placeholder="כתבו כאן את התנאים הכלליים של החוזה שלכם..."
            className="w-full rounded-lg px-2.5 py-2 text-sm border border-line bg-white leading-relaxed mb-2.5"
          />
          {error && <p className="text-xs text-rose mb-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60">
              {saving ? "שומר..." : saved ? "נשמר ✓" : "שמירה"}
            </button>
            <button onClick={revertToDefault} disabled={saving} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
              חזרה לברירת המחדל
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
