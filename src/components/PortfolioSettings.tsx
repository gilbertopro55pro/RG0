"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Photographer } from "@/lib/types";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export default function PortfolioSettings({ photographer }: { photographer: Photographer }) {
  const supabase = createClient();
  const [enabled, setEnabled] = useState(photographer.portfolio_enabled);
  const [slug, setSlug] = useState(photographer.portfolio_slug ?? "");
  const [bio, setBio] = useState(photographer.portfolio_bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setError(null);
    const cleanSlug = slugify(slug);
    if (enabled && !SLUG_PATTERN.test(cleanSlug)) {
      setError("כתובת לא תקינה — רק אותיות אנגלית קטנות, מספרים ומקפים, לפחות 2 תווים");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase
      .from("photographers")
      .update({
        portfolio_enabled: enabled,
        portfolio_slug: cleanSlug || null,
        portfolio_bio: bio.trim() || null,
      })
      .eq("id", photographer.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.code === "23505" ? "הכתובת הזו כבר תפוסה — נסו כתובת אחרת" : "שגיאה בשמירה");
      return;
    }
    setSlug(cleanSlug);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const previewUrl = slug ? `/p/${slugify(slug)}` : null;

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold tracking-wide">פורטפוליו ציבורי</span>
        <button
          onClick={() => setEnabled((v) => !v)}
          role="switch"
          aria-checked={enabled}
          aria-label="פורטפוליו ציבורי"
          className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
          style={{
            background: enabled ? "var(--color-amber-deep)" : "var(--color-line)",
            justifyContent: enabled ? "flex-start" : "flex-end",
          }}
        >
          <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
        </button>
      </div>
      <p className="text-xs mb-3.5 text-ink-soft">
        עמוד ציבורי עם תמונות שתבחרו מהגלריות שלכם — אפשר לשתף כתיק עבודות ללקוחות פוטנציאליים. סימון תמונה
        &quot;לתיק עבודות&quot; נעשה מתוך ניהול הגלריה עצמה, בתפריט הפעולות של כל תמונה.
      </p>

      {enabled && (
        <>
          <label className="text-xs block mb-1 text-ink-soft">כתובת הפורטפוליו</label>
          <div className="flex items-center gap-1 mb-3">
            <span className="text-xs text-ink-soft font-data shrink-0">myframeflow.com/p/</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="roi-gilberto"
              dir="ltr"
              className="flex-1 min-w-0 rounded-lg px-2.5 py-2 text-sm border border-line bg-white font-data"
            />
          </div>

          <label className="text-xs block mb-1 text-ink-soft">טקסט פתיחה (אופציונלי)</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="כמה מילים עליכם ועל הסטודיו"
            className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-3 resize-none"
          />
        </>
      )}

      {error && <p className="text-xs text-rose mb-2">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
        >
          {saving ? "שומר..." : saved ? "נשמר ✓" : "שמירה"}
        </button>
        {enabled && previewUrl && (
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline text-ink-soft">
            צפייה בפורטפוליו ←
          </a>
        )}
      </div>
    </div>
  );
}
