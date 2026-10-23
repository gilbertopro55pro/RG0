"use client";

import { useState, type ReactNode } from "react";
import {
  QR_MIN_CM,
  QR_MIN_MODULE_MM,
  QR_RECOMMENDED_CM,
  magnetQrUrl,
  newQrElement,
  normalizeQrUrl,
  qrColorProblem,
  qrModuleMm,
  qrPctForCm,
  qrSizeCm,
  qrSizeRangePct,
} from "@/lib/magnetQr";
import type { FrameOrientation, MagnetFrameQrElement, MagnetFrameSettings, MagnetFrameSizeKey } from "@/lib/types";
import { useT } from "@/i18n/client";

// The editor's "QR" tab (stage 3, owner 2026-10-22): a code on the magnet that guests scan at home.
// It opens the event's photos (view only, lib/magnetGuest.ts), the photographer's portfolio, or a
// link they type. The frame draws it (MagnetFramePreview) and the export prints it at 300 DPI from
// the same matrix (lib/magnetQr.ts).

type Target = MagnetFrameQrElement["target"];

export type QrPanelProps = {
  selected: MagnetFrameQrElement | null;
  eventId: string | null;
  portfolioSlug: string | null;
  sizeKey: MagnetFrameSizeKey | undefined; // frameSettings.sizeKey (undefined = "20x15")
  orientation: FrameOrientation; // the frame being edited in step 1
  onAdd: (el: MagnetFrameQrElement) => void;
  onChange: (id: string, patch: Partial<MagnetFrameQrElement>) => void;
  actions: ReactNode | null; // duplicate / layers / lock / delete for the selected QR
  // The codes already on the frame, to pick or remove one without finding it on the frame first
  // (owner, 2026-10-23: "תאפשר הסרת קוד ה-QR מהמסגרת אם המשתמש לא מעוניין בו").
  existing: MagnetFrameQrElement[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  // The frame's mat, to place a new code on the bottom mat (missing = the default mat).
  mat?: Pick<MagnetFrameSettings, "borderRatioPct" | "bottomBorderRatioPct">;
};

const DARK_SWATCHES = [
  { label: "שחור", value: "#111111" },
  { label: "כחול כהה", value: "#1c2a4a" },
  { label: "בורדו", value: "#7a1f2b" },
  { label: "ירוק כהה", value: "#1f3d2c" },
];

const LIGHT_SWATCHES = [
  { label: "לבן", value: "#ffffff" },
  { label: "שמנת", value: "#f5efe6" },
  { label: "ורוד בהיר", value: "#f7e6e4" },
];

function Swatches({ value, onChange, swatches, label }: { value: string; onChange: (hex: string) => void; swatches: { label: string; value: string }[]; label: string }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-card border border-line">
      <span className="text-[10px] text-ink-soft whitespace-nowrap w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5">
        {swatches.map((c) => (
          <button
            key={c.value}
            type="button"
            title={t(c.label)}
            aria-label={t(c.label)}
            onClick={() => onChange(c.value)}
            className="h-6 w-6 rounded-full border-2"
            style={{ background: c.value, borderColor: value.toLowerCase() === c.value ? "var(--color-sage)" : "var(--color-line)" }}
          />
        ))}
        <label className="h-6 w-6 rounded-full border-2 border-line shrink-0 cursor-pointer relative overflow-hidden" style={{ background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }} title={t("צבע חופשי")}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={t("צבע חופשי")} />
        </label>
      </div>
    </div>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] leading-snug rounded-lg px-2.5 py-1.5" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
      {children}
    </p>
  );
}

// The three things a code can open. A choice that can't work here is disabled, with why.
function TargetChoice({ value, onChange, eventId, portfolioSlug }: { value: Target; onChange: (t: Target) => void; eventId: string | null; portfolioSlug: string | null }) {
  const t = useT();
  const options: { key: Target; label: string; disabledReason: string | null }[] = [
    { key: "gallery", label: t("התמונות מהאירוע, לאורחים"), disabledReason: eventId ? null : t("קודם משייכים את המסגרת לאירוע") },
    { key: "portfolio", label: t("הפורטפוליו שלי"), disabledReason: portfolioSlug ? null : t("הפורטפוליו עוד לא פעיל") },
    { key: "url", label: t("קישור אחר"), disabledReason: null },
  ];
  return (
    <div className="grid gap-1.5" role="radiogroup">
      {options.map((o) => {
        const active = value === o.key;
        const disabled = !!o.disabledReason;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-start border disabled:cursor-not-allowed"
            style={{
              borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
              background: active ? "var(--color-amber-bg)" : "var(--color-card)",
              color: "var(--color-ink)",
              opacity: disabled ? 0.55 : 1,
            }}
          >
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-full border-2 shrink-0"
              style={{ borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)", background: active ? "var(--color-amber-deep)" : "transparent", boxShadow: active ? "inset 0 0 0 2px var(--color-amber-bg)" : undefined }}
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">{o.label}</span>
              {o.disabledReason && <span className="block text-[10px] text-ink-soft">{o.disabledReason}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function UrlInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const invalid = value.trim() !== "" && !normalizeQrUrl(value);
  return (
    <div>
      <input
        type="url"
        inputMode="url"
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="instagram.com/studio"
        className="w-full rounded-lg px-3 py-2 text-sm bg-card border border-line text-ink"
        aria-label={t("הקישור שהקוד פותח")}
        aria-invalid={invalid}
      />
      {invalid && <p className="text-[11px] mt-1" style={{ color: "var(--color-rose)" }}>{t("זה לא נראה כמו כתובת של אתר")}</p>}
    </div>
  );
}

const TARGET_LABEL: Record<Target, string> = { gallery: "לגלריה של האירוע", portfolio: "לפורטפוליו", url: "לקישור" };

export default function QrPanel({ selected, eventId, portfolioSlug, sizeKey, orientation, onAdd, onChange, actions, mat, existing, onSelect, onRemove }: QrPanelProps) {
  const t = useT();
  const firstAvailable: Target = eventId ? "gallery" : portfolioSlug ? "portfolio" : "url";
  const [newTarget, setNewTarget] = useState<Target>(firstAvailable);
  const [newUrl, setNewUrl] = useState("");
  // A choice that stopped being possible (the event was unlinked) falls back to one that is.
  const target: Target = (newTarget === "gallery" && !eventId) || (newTarget === "portfolio" && !portfolioSlug) ? firstAvailable : newTarget;
  const ctx = { eventId, portfolioSlug };

  const add = () => onAdd(newQrElement(target, { sizeKey, orientation, mat, url: target === "url" ? newUrl.trim() : undefined }));

  const range = qrSizeRangePct(sizeKey);
  const minCm = QR_MIN_CM;
  const maxCm = Math.floor(qrSizeCm(range.max, sizeKey) * 10) / 10;

  const selectedUrl = selected ? magnetQrUrl(selected, ctx) : null;
  const selectedCm = selected ? qrSizeCm(selected.sizePct, sizeKey) : 0;
  const colorProblem = selected ? qrColorProblem(selected.color, selected.bgColor) : null;
  const dense = selected && selectedUrl ? qrModuleMm(selectedUrl, selectedCm) < QR_MIN_MODULE_MM : false;
  const showsGallery = selected ? selected.target === "gallery" : target === "gallery";

  const setCm = (cm: number) => {
    if (!selected) return;
    const clamped = Math.min(maxCm, Math.max(minCm, cm));
    onChange(selected.id, { sizePct: Math.min(range.max, Math.max(range.min, qrPctForCm(clamped, sizeKey))) });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft leading-relaxed">{t("האורחים סורקים את הקוד שעל המגנט בטלפון, והוא פותח את מה שבוחרים כאן.")}</p>

      {!selected && existing.length > 0 && (
        <div className="rounded-xl p-3 bg-chip space-y-2">
          <div className="text-[11px] font-semibold text-ink-soft">{existing.length > 1 ? t("קודי QR במסגרת") : t("קוד QR במסגרת")}</div>
          {existing.map((qr) => (
            <div key={qr.id} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-xs text-ink">{t("קוד QR {target}", { target: t(TARGET_LABEL[qr.target]) })}</span>
              <button type="button" onClick={() => onSelect(qr.id)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-card border border-line text-ink">
                {t("עריכה")}
              </button>
              <button
                type="button"
                onClick={() => onRemove(qr.id)}
                disabled={qr.locked}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-card border border-line text-rose disabled:opacity-40"
              >
                {t("הסרה מהמסגרת")}
              </button>
            </div>
          ))}
        </div>
      )}

      {!selected && (
        <div className="space-y-2">
          <TargetChoice value={target} onChange={setNewTarget} eventId={eventId} portfolioSlug={portfolioSlug} />
          {target === "url" && <UrlInput value={newUrl} onChange={setNewUrl} />}
        </div>
      )}

      <button type="button" onClick={add} className="w-full whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-semibold bg-ink text-white">
        {t("+ הוספת קוד QR")}
      </button>

      {selected && (
        <div className="rounded-xl p-3 bg-chip space-y-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="text-[11px] font-semibold text-ink-soft">{t("הקוד שנבחר")}</div>
          <TargetChoice
            value={selected.target}
            onChange={(next) => onChange(selected.id, next === "url" ? { target: next, url: selected.url ?? "" } : { target: next })}
            eventId={eventId}
            portfolioSlug={portfolioSlug}
          />
          {selected.target === "url" && <UrlInput value={selected.url ?? ""} onChange={(v) => onChange(selected.id, { url: v })} />}
          {selectedUrl ? (
            <p className="text-[10px] text-ink-soft truncate">
              {t("הקוד פותח:")}{" "}
              <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                {selectedUrl.replace(/^https?:\/\//i, "")}
              </span>
            </p>
          ) : (
            <Warning>{t("לקוד עוד אין לאן להוביל, ולכן הוא לא ייכנס לקובץ.")}</Warning>
          )}

          <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
            <span className="text-[10px] text-ink-soft whitespace-nowrap w-16 shrink-0">{t("גודל")}</span>
            <input type="range" min={minCm} max={maxCm} step={0.1} value={Math.min(maxCm, Math.max(minCm, selectedCm))} onChange={(e) => setCm(Number(e.target.value))} className="w-full" />
            <input
              type="number"
              min={minCm}
              max={maxCm}
              step={0.1}
              value={Math.round(selectedCm * 10) / 10}
              onChange={(e) => setCm(Number(e.target.value) || minCm)}
              className="w-14 shrink-0 rounded-md px-1.5 py-0.5 text-xs text-center border border-line bg-white text-ink"
              aria-label={t("גודל")}
            />
            <span className="text-[10px] text-ink-soft shrink-0">{t("ס״מ")}</span>
          </div>
          {selectedCm < QR_RECOMMENDED_CM - 0.05 && <Warning>{t("קטן מדי לסריקה בטוחה. מומלץ לפחות {cm} ס״מ.", { cm: String(QR_RECOMMENDED_CM) })}</Warning>}
          {dense && <Warning>{t("הקישור ארוך, ולכן הקוד צפוף. כדאי להגדיל אותו או לקצר את הקישור.")}</Warning>}

          <Swatches label={t("צבע הקוד")} value={selected.color} onChange={(hex) => onChange(selected.id, { color: hex })} swatches={DARK_SWATCHES} />
          <Swatches label={t("צבע הרקע")} value={selected.bgColor} onChange={(hex) => onChange(selected.id, { bgColor: hex })} swatches={LIGHT_SWATCHES} />
          {colorProblem === "inverted" && <Warning>{t("הקוד צריך להיות כהה מהרקע שלו. רוב הטלפונים לא קוראים קוד בהיר על רקע כהה.")}</Warning>}
          {colorProblem === "low" && <Warning>{t("אין מספיק ניגוד בין הקוד לרקע, וייתכן שהוא לא ייסרק. כדאי קוד כהה יותר או רקע בהיר יותר.")}</Warning>}

          {actions}
          <button
            type="button"
            onClick={() => onRemove(selected.id)}
            disabled={selected.locked}
            className="w-full rounded-lg px-3 py-2 text-sm font-semibold bg-card border border-line text-rose disabled:opacity-40"
          >
            {t("הסרת קוד ה-QR מהמסגרת")}
          </button>
        </div>
      )}

      {showsGallery && (
        <p className="text-[11px] text-ink-soft leading-relaxed">
          {t("האורחים רואים את הגלריה באיכות רשת, לצפייה בלבד, בלי מועדפים ובלי בחירת תמונות. הקוד עובד כבר לפני שהגלריה עולה: עד אז נפתח דף שהתמונות בדרך. הקישור מפסיק לעבוד כשמוחקים את הקוד מכל המסגרות של האירוע.")}
        </p>
      )}
    </div>
  );
}
