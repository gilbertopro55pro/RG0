"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import type { GalleryRow } from "@/lib/types";

const CLOSE_ANIMATION_MS = 220;

type GalleryOption = Pick<GalleryRow, "id" | "title" | "created_at">;

// Links one of the photographer's OWN standalone galleries (no event_id yet) to this event,
// instead of creating a new one — for galleries a photographer built before an event card
// existed for them. `galleries.event_id` carries a `unique` constraint (one gallery per event),
// so the picker only ever offers galleries that aren't already linked to something else.
export default function LinkExistingGalleryModal({
  eventId,
  onClose,
  onLinked,
}: {
  eventId: string;
  onClose: () => void;
  onLinked: (gallery: GalleryRow) => void;
}) {
  const supabase = createClient();
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [options, setOptions] = useState<GalleryOption[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [step, setStep] = useState<"pick" | "confirm1" | "confirm2">("pick");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Portaled straight to document.body — same fix, same reason, as NewGalleryModal.tsx's own
  // comment: nested this deep (inside the event page's GallerySection card), a fixed-position
  // full-screen modal is exactly the DOM shape known to make position:fixed unreliable on iOS
  // Safari standalone mode. document.body only exists client-side, hence the mounted gate.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("galleries")
        .select("id, title, created_at")
        .is("event_id", null)
        .eq("is_portfolio_only", false)
        .order("created_at", { ascending: false })
        .returns<GalleryOption[]>();
      if (!cancelled) setOptions(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeWithAnimation = (after?: () => void) => {
    setClosing(true);
    setTimeout(() => {
      if (after) after();
      else onClose();
    }, CLOSE_ANIMATION_MS);
  };

  const selected = options?.find((g) => g.id === selectedId) ?? null;

  const link = async () => {
    if (!selected) return;
    setLinking(true);
    setError(null);
    const { data: updated, error: updateError } = await supabase
      .from("galleries")
      .update({ event_id: eventId })
      .eq("id", selected.id)
      .select()
      .single<GalleryRow>();
    setLinking(false);
    if (updateError || !updated) {
      setError(updateError?.message ?? "שגיאה בקישור הגלריה");
      return;
    }
    closeWithAnimation(() => onLinked(updated));
  };

  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background: "rgba(46,49,66,0.45)",
        backdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        transition: `backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease, -webkit-backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease`,
      }}
      onClick={() => closeWithAnimation()}
    >
      <style>{`
        @keyframes linkGalleryZoomOut { from { transform: scale(1); opacity: 1; } to { transform: scale(0.85); opacity: 0; } }
        .link-gallery-closing { animation: linkGalleryZoomOut ${CLOSE_ANIMATION_MS}ms ease forwards; }
      `}</style>
      <div
        className={`w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto ${closing ? "link-gallery-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display">קישור לגלריה קיימת</h2>
          <button
            onClick={() => closeWithAnimation()}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            ✕
          </button>
        </div>

        {step === "pick" && (
          <>
            {options === null ? (
              <p className="text-sm text-ink-soft">טוען גלריות...</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-ink-soft">אין לך גלריות עצמאיות שעוד לא משויכות לאירוע.</p>
            ) : (
              <>
                <label className="text-xs block mb-1 text-ink-soft">בחירת גלריה</label>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                >
                  <option value="">בחירה...</option>
                  {options.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </>
            )}
            {error && <p className="text-xs text-rose mt-3">{error}</p>}
            <button
              onClick={() => setStep("confirm1")}
              disabled={!selected}
              className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-40 mt-5"
            >
              המשך
            </button>
          </>
        )}

        {step === "confirm1" && selected && (
          <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: "var(--color-chip)" }}>
            <p className="text-xs text-ink">
              לקשר את הגלריה &quot;<span className="font-semibold">{selected.title}</span>&quot; לאירוע הזה?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setStep("pick")}
                className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
              <button
                onClick={() => setStep("confirm2")}
                className="flex-1 rounded-lg py-2 text-xs font-semibold bg-ink text-white"
              >
                כן, המשך
              </button>
            </div>
          </div>
        )}

        {step === "confirm2" && selected && (
          <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: "var(--color-chip)" }}>
            <p className="text-xs font-semibold text-ink">אישור אחרון</p>
            <p className="text-xs text-ink-soft">
              הגלריה &quot;{selected.title}&quot; תוצג מעכשיו בכרטיס האירוע הזה. אפשר תמיד לנתק אותה בחזרה מכרטיס האירוע.
            </p>
            {error && <p className="text-xs text-rose">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setStep("confirm1")}
                disabled={linking}
                className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
              >
                ביטול
              </button>
              <button
                onClick={link}
                disabled={linking}
                className="flex-1 rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60"
              >
                {linking ? "מקשר..." : "כן, לקשר"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
