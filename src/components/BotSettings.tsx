"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Photographer } from "@/lib/types";

export default function BotSettings({ photographer }: { photographer: Photographer }) {
  const supabase = createClient();
  const [enabled, setEnabled] = useState(photographer.whatsapp_bot_enabled);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    await supabase.from("photographers").update({ whatsapp_bot_enabled: next }).eq("id", photographer.id);
    setEnabled(next);
    setSaving(false);
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold tracking-wide mb-1">בוט AI לפניות חדשות בוואטסאפ</div>
      <p className="text-xs mb-3.5 text-ink-soft">
        כשלקוח/ה כותבים לוואטסאפ העסקי שלך, הבוט יבדוק זמינות מול היומן וישלח הצעת מחיר לפי המחירון —
        או יעדכן שהתאריך תפוס ויוסיף אותם לרשימת המתנה. ההזמנה תיכנס למערכת רק אחרי שתאשר/י אותה בעצמך
        בעמוד הלידים.
      </p>
      <button
        onClick={toggle}
        disabled={saving}
        className="w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
        style={{
          background: enabled ? "var(--color-sage-bg)" : "var(--color-chip)",
          color: enabled ? "var(--color-sage)" : "var(--color-ink-soft)",
        }}
      >
        {enabled ? "הבוט פעיל ✓ — לחיצה לכיבוי" : "הבוט כבוי — לחיצה להפעלה"}
      </button>
    </div>
  );
}
