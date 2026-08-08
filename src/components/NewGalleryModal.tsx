"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GalleryRow } from "@/lib/types";

const EXPIRY_OPTIONS: { value: 1 | 3 | 6; label: string }[] = [
  { value: 1, label: "חודש" },
  { value: 3, label: "3 חודשים" },
  { value: 6, label: "חצי שנה" },
];

const CLOSE_ANIMATION_MS = 220;

export default function NewGalleryModal({ onClose, eventId }: { onClose: () => void; eventId?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<"details" | "permissions">("details");
  const [title, setTitle] = useState("");
  const [shootDate, setShootDate] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [expiryMonths, setExpiryMonths] = useState<1 | 3 | 6 | null>(3);
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  // Same blur-in/zoom-out choreography as NewEventModal, kept local since this is the only other
  // modal that currently needs it — a shared wrapper isn't worth it for two consumers.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const closeWithAnimation = (after?: () => void) => {
    setClosing(true);
    setTimeout(() => {
      if (after) after();
      else onClose();
    }, CLOSE_ANIMATION_MS);
  };

  const create = async () => {
    if (!title.trim()) {
      setError("יש להזין שם לגלריה");
      setTab("details");
      return;
    }
    setCreating(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("יש להתחבר מחדש");
      setCreating(false);
      return;
    }
    const { data: created, error: insertError } = await supabase
      .from("galleries")
      .insert({
        event_id: eventId ?? null,
        photographer_id: user.id,
        title: title.trim(),
        shoot_date: eventId ? null : shootDate || null,
        client_email: clientEmail.trim() || null,
        expiry_months: expiryMonths,
        allow_downloads: allowDownloads,
      })
      .select()
      .single<GalleryRow>();
    setCreating(false);
    if (insertError || !created) {
      setError(insertError?.message ?? "שגיאה ביצירת הגלריה");
      return;
    }
    closeWithAnimation(() => router.push(`/galleries/${created.id}`));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(46,49,66,0.45)",
        backdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        transition: `backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease, -webkit-backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease`,
      }}
      onClick={() => closeWithAnimation()}
    >
      <style>{`
        @keyframes newGalleryZoomOut { from { transform: scale(1); opacity: 1; } to { transform: scale(0.85); opacity: 0; } }
        .new-gallery-closing { animation: newGalleryZoomOut ${CLOSE_ANIMATION_MS}ms ease forwards; }
      `}</style>
      <div
        className={`w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto ${closing ? "new-gallery-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display">גלריה חדשה</h2>
          <button
            onClick={() => closeWithAnimation()}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            ✕
          </button>
        </div>

        {!eventId && (
          <p className="text-xs mb-4 text-ink-soft">
            יוצרים גלריה עצמאית שלא משויכת לאירוע קיים במערכת — שימושי לצילומים שלא נסגרו כאירוע (למשל צילומי מוצר או פרויקט אישי).
          </p>
        )}

        <div className="flex gap-1.5 mb-4">
          <button
            onClick={() => setTab("details")}
            className="flex-1 rounded-full py-2 text-xs font-semibold"
            style={{
              background: tab === "details" ? "var(--color-ink)" : "var(--color-chip)",
              color: tab === "details" ? "var(--color-paper)" : "var(--color-ink-soft)",
            }}
          >
            פרטים
          </button>
          <button
            onClick={() => setTab("permissions")}
            className="flex-1 rounded-full py-2 text-xs font-semibold"
            style={{
              background: tab === "permissions" ? "var(--color-ink)" : "var(--color-chip)",
              color: tab === "permissions" ? "var(--color-paper)" : "var(--color-ink-soft)",
            }}
          >
            הרשאות ושמירה
          </button>
        </div>

        {tab === "details" ? (
          <div className="space-y-3.5">
            <div>
              <label className="text-xs block mb-1 text-ink-soft">שם הגלריה</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="לדוגמה: משפחת כהן — צילומי משפחה"
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Real px min-width (not min-w-0) — iOS Safari's native date-input control can
                  render with zero visible width when its flex item is allowed to shrink past
                  its comfortable size. flex-wrap is the fallback if both truly don't fit. */}
              {!eventId && (
                <div className="flex-1" style={{ minWidth: 150 }}>
                  <label className="text-xs block mb-1 text-ink-soft">תאריך הצילום</label>
                  <input
                    type="date"
                    value={shootDate}
                    onChange={(e) => setShootDate(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  />
                </div>
              )}
              <div className="flex-1" style={{ minWidth: 150 }}>
                <label className="text-xs block mb-1 text-ink-soft">משך שמירת הגלריה</label>
                <select
                  value={expiryMonths ?? "indefinite"}
                  onChange={(e) => setExpiryMonths(e.target.value === "indefinite" ? null : (Number(e.target.value) as 1 | 3 | 6))}
                  className="w-full rounded-lg px-2 py-2 text-sm border border-line bg-white"
                >
                  {EXPIRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  <option value="indefinite">ללא הגבלת זמן</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs block mb-1 text-ink-soft">אימייל הלקוח/ה (לא חובה — לתזכורת שבוע לפני שהגלריה נמחקת)</label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 bg-chip">
              <div>
                <div className="text-sm font-semibold">אפשרות הורדת קבצים מקוריים</div>
                <div className="text-xs text-ink-soft mt-0.5">כשמכובה, הלקוח/ה יוכלו רק לצפות בתמונות, לא להוריד</div>
              </div>
              <button
                onClick={() => setAllowDownloads(!allowDownloads)}
                role="switch"
                aria-checked={allowDownloads}
                className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
                style={{
                  background: allowDownloads ? "var(--color-amber-deep)" : "var(--color-line)",
                  justifyContent: allowDownloads ? "flex-start" : "flex-end",
                }}
              >
                <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose mt-3">{error}</p>}

        <button
          onClick={create}
          disabled={creating}
          className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60 mt-5"
        >
          {creating ? "יוצר..." : "יצירת גלריה"}
        </button>
      </div>
    </div>
  );
}
