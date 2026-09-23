"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import type { Photographer } from "@/lib/types";

const DEFAULT_COLOR = "#4a5fd9";

// Studio Pro's "full branding" perk: a custom accent color carried across every one of the
// photographer's public galleries (buttons, highlights) instead of each theme's own default
// accent — the photographer's business logo (already uploaded once, under "הצעות מחיר") appears
// there too. Both are applied in src/app/gallery/[token]/page.tsx, gated on the same tier check.
export default function BrandingSettings({ photographer, hasLogo }: { photographer: Photographer; hasLogo: boolean }) {
  const supabase = createClient();
  const isPro = SUBSCRIPTION_PLANS[photographer.plan].tier === "studio_pro";
  const [color, setColor] = useState(photographer.brand_color ?? DEFAULT_COLOR);
  const [enabled, setEnabled] = useState(!!photographer.brand_color);
  const [saving, setSaving] = useState(false);

  const save = async (nextColor: string | null) => {
    setSaving(true);
    await supabase.from("photographers").update({ brand_color: nextColor }).eq("id", photographer.id);
    setSaving(false);
  };

  if (!isPro) {
    return (
      <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-1">מיתוג מלא</div>
        <p className="text-xs text-ink-soft">
          צבע מותג אישי והלוגו שלכם על כל הגלריות ללקוחות, זמין במסלול פרו+.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold tracking-wide mb-1">מיתוג מלא</div>
      <p className="text-xs mb-3.5 text-ink-soft">
        צבע המותג שלכם יחליף את צבע ההדגשה בכל הגלריות ללקוחות (כפתורים, הדגשות). הלוגו שהעליתם בלשונית
        &quot;הצעות מחיר&quot; יופיע גם הוא בראש כל גלריה.
        {!hasLogo && " עדיין לא הועלה לוגו. אפשר להעלות בלשונית הצעות מחיר."}
      </p>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold">צבע מותג מותאם</span>
        <button
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            save(next ? color : null);
          }}
          disabled={saving}
          role="switch"
          aria-checked={enabled}
          aria-label="צבע מותג מותאם"
          className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5 disabled:opacity-70"
          style={{
            background: enabled ? "var(--color-amber-deep)" : "var(--color-line)",
            justifyContent: enabled ? "flex-start" : "flex-end",
          }}
        >
          <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
        </button>
      </div>

      {enabled && (
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            onBlur={() => save(color)}
            disabled={saving}
            className="h-10 w-14 rounded-lg border border-line cursor-pointer"
          />
          <span className="text-xs font-data text-ink-soft">{color}</span>
        </div>
      )}
    </div>
  );
}
