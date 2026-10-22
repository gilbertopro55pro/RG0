"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { extractPalette, suggestFrameColors } from "@/lib/magnetPalette";

// "צבעים מההזמנה" in the frame settings (magnet frames, stage 3): the photographer picks the
// invitation's image (it stays in the browser), the editor reads its main colors, and offers them
// next to the fixed swatches everywhere in the editor, plus a one-click match: the mat, the texts
// and the ornaments in the invitation's colors.
export default function InvitationPalette({
  palette,
  onPalette,
  onApply,
}: {
  palette: string[] | undefined;
  onPalette: (colors: string[] | undefined) => void;
  onApply: (colors: { mat: string; text: string; accent: string }) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const read = async (file: File) => {
    setBusy(true);
    setError(false);
    try {
      const bitmap = await createImageBitmap(file);
      // A few hundred pixels are plenty for the main colors.
      const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const colors = extractPalette(ctx.getImageData(0, 0, w, h).data, 6);
      if (colors.length === 0) throw new Error();
      onPalette(colors);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold">{t("צבעים מההזמנה")}</span>
      {palette && palette.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {palette.map((c) => (
              <span key={c} className="h-7 w-7 rounded-full border border-line" style={{ background: c }} title={c} />
            ))}
          </div>
          <p className="text-[10px] text-ink-soft leading-relaxed">{t("הצבעים מופיעים עכשיו ליד הצבעים הקבועים בכל מקום בעורך.")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onApply(suggestFrameColors(palette))} className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-ink text-white">
              {t("התאמת המסגרת לצבעי ההזמנה")}
            </button>
            <label className="text-[11px] text-ink-soft underline cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void read(file);
                }}
              />
              {t("הזמנה אחרת")}
            </label>
            <button type="button" onClick={() => onPalette(undefined)} className="text-[11px] text-ink-soft underline">
              {t("הסרת הצבעים")}
            </button>
          </div>
        </>
      ) : (
        <label className="flex items-center justify-center rounded-lg border border-dashed border-line p-3 text-center bg-card cursor-pointer">
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void read(file);
            }}
          />
          <span className="text-xs font-semibold text-ink-soft">{busy ? t("קורא את הצבעים...") : t("+ בחירת תמונה של ההזמנה")}</span>
        </label>
      )}
      {error && <p className="text-[11px] text-rose">{t("לא הצלחנו לקרוא את התמונה. נסו קובץ JPG או PNG.")}</p>}
      {!palette?.length && <p className="text-[10px] text-ink-soft leading-relaxed">{t("התמונה נשארת במכשיר. רק הצבעים נשמרים במסגרת.")}</p>}
    </div>
  );
}
