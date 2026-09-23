"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GalleryRow } from "@/lib/types";
import { GALLERY_EXPIRY_OPTIONS_BY_TIER, SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { ADMIN_EMAIL } from "@/lib/admin";
import { IconClose } from "@/components/icons/AlbumIcons";

const CLOSE_ANIMATION_MS = 220;

export default function NewGalleryModal({
  onClose,
  eventId,
  eventClientName,
  eventClientPhone,
  eventDate,
  // Set when this event already has a gallery row linked but not yet activated (a leftover from
  // the old auto-create-on-every-event path, kept around instead of deleted — see migration
  // 0120_gallery_activated.sql). Filling out this form then UPDATEs that same row instead of
  // INSERTing a second one, which `galleries.event_id`'s unique constraint would reject outright.
  existingGalleryId,
  onCreated,
}: {
  onClose: () => void;
  eventId?: string;
  eventClientName?: string;
  eventClientPhone?: string;
  eventDate?: string;
  existingGalleryId?: string;
  onCreated?: (gallery: GalleryRow) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<"form" | "success">("form");
  const [createdGalleryId, setCreatedGalleryId] = useState<string | null>(null);
  const [tab, setTab] = useState<"details" | "permissions">("details");
  // Pre-filled from the event card's own data (sometimes the gallery name needs to differ from the
  // client/event name, hence still freely editable) — nothing left for the photographer to retype
  // here that the event already knows.
  const [title, setTitle] = useState(eventClientName ?? "");
  const [shootDate, setShootDate] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState(eventClientPhone ?? "");
  // Options (and the default, its longest one) depend on the photographer's plan — fetched once
  // on open rather than threaded down as a prop, since this modal is opened from two unrelated
  // parents (GalleriesListView, GallerySection) that don't otherwise need to know the plan.
  const [expiryOptions, setExpiryOptions] = useState(GALLERY_EXPIRY_OPTIONS_BY_TIER.standard);
  const [expiryDays, setExpiryDays] = useState<7 | 14 | 30 | 90 | 180 | 365>(30);
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [allowClientUpload, setAllowClientUpload] = useState(false);
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

  // Rendered via a portal straight to document.body (see the return statement below) instead of
  // inline where this component sits in the tree — nested inside the event page's own GallerySection
  // card. A fixed-position full-screen modal nested that deep is exactly the shape of DOM structure
  // known to make position:fixed unreliable on iOS Safari, especially in this app's standalone
  // (home-screen) mode — see the identical fix (and its own fuller comment) in
  // CustomPackagesSettings.tsx. Confirmed live via a screenshot: the modal opened but was
  // vertically mispositioned and dimmed only part of the screen, with the event page's contract
  // section visibly bleeding through underneath it. Portaling to document.body sidesteps it
  // categorically. document.body only exists client-side, hence the mounted gate (this component is
  // only ever rendered in response to a client click anyway, so it flips true essentially
  // immediately).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: photographer } = await supabase
        .from("photographers")
        .select("plan, email")
        .eq("id", user.id)
        .single<{ plan: SubscriptionPlan; email: string }>();
      if (cancelled || !photographer) return;
      const tier =
        SUBSCRIPTION_PLANS[photographer.plan].tier === "studio_pro" || photographer.email === ADMIN_EMAIL
          ? "studio_pro"
          : "standard";
      const options = GALLERY_EXPIRY_OPTIONS_BY_TIER[tier];
      setExpiryOptions(options);
      setExpiryDays(options[options.length - 1].value);
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
    const fields = {
      title: title.trim(),
      title_customized: true,
      shoot_date: eventId ? eventDate ?? null : shootDate || null,
      client_email: clientEmail.trim() || null,
      client_phone: clientPhone.trim() || null,
      expiry_days: expiryDays,
      allow_downloads: allowDownloads,
      allow_client_upload: allowClientUpload,
      activated: true,
    };
    const { data: created, error: saveError } = existingGalleryId
      ? await supabase.from("galleries").update(fields).eq("id", existingGalleryId).select().single<GalleryRow>()
      : await supabase
          .from("galleries")
          .insert({ ...fields, event_id: eventId ?? null, photographer_id: user.id })
          .select()
          .single<GalleryRow>();
    setCreating(false);
    if (saveError || !created) {
      setError(saveError?.message ?? "שגיאה ביצירת הגלריה");
      return;
    }
    setCreatedGalleryId(created.id);
    setStep("success");
    onCreated?.(created);
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
        @keyframes newGalleryZoomOut { from { transform: scale(1); opacity: 1; } to { transform: scale(0.85); opacity: 0; } }
        .new-gallery-closing { animation: newGalleryZoomOut ${CLOSE_ANIMATION_MS}ms ease forwards; }
      `}</style>
      <div
        className={`w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto ${closing ? "new-gallery-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display">
            {step === "success" ? "הגלריה נוצרה" : eventId ? "פתיחת גלריה לאירוע" : "גלריה חדשה"}
          </h2>
          <button
            onClick={() => closeWithAnimation()}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {step === "success" && createdGalleryId ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              {eventId ? "הגלריה נוצרה בהצלחה וקושרה לאירוע." : "הגלריה נוצרה בהצלחה."}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => closeWithAnimation(() => router.push(`/galleries/${createdGalleryId}`))}
                className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white"
              >
                מעבר לגלריה
              </button>
              <button
                onClick={() => closeWithAnimation(() => router.refresh())}
                className="w-full rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink"
              >
                המשך ללא מעבר לגלריה
              </button>
            </div>
          </div>
        ) : (
          <>
            {!eventId && (
              <p className="text-xs mb-4 text-ink-soft">
                יוצרים גלריה עצמאית שלא משויכת לאירוע קיים במערכת, שימושי לצילומים שלא נסגרו כאירוע (למשל צילומי מוצר או פרויקט אישי).
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
                    placeholder="לדוגמה: משפחת כהן, צילומי משפחה"
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  />
                </div>

                {/* grid-cols-2 (not flex + flex-1) is load-bearing: Tailwind's grid-cols-N utility
                    sets each track to minmax(0, 1fr), which caps a column's width at its fair share
                    of the row NO MATTER how wide its content wants to render — unlike flex-1, where a
                    native date input's own intrinsic/preferred width (confirmed to sometimes exceed
                    a plain px min-width hack, particularly on iOS Safari) can still push a flex item
                    wider than intended and overlap its neighbor. Two columns of equal width, with a
                    real gap between them, together always span exactly the row's full width — the
                    same width as the שם הגלריה field above, since that's what a 2-up grid guarantees
                    structurally, not just in the common case. */}
                <div className={`grid gap-2 ${eventId ? "grid-cols-1" : "grid-cols-2"}`}>
                  {!eventId && (
                    <div>
                      <label className="text-xs block mb-1 text-ink-soft">תאריך הצילום</label>
                      <input
                        type="date"
                        value={shootDate}
                        onChange={(e) => setShootDate(e.target.value)}
                        className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs block mb-1 text-ink-soft">משך שמירת הגלריה</label>
                    <select
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(Number(e.target.value) as 7 | 14 | 30 | 90 | 180 | 365)}
                      className="w-full rounded-lg px-2 py-2 text-sm border border-line bg-white"
                    >
                      {expiryOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs block mb-1 text-ink-soft">אימייל הלקוח/ה (לא חובה, לתזכורת שבוע לפני שהגלריה נמחקת)</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs block mb-1 text-ink-soft">טלפון הלקוח/ה (לא חובה, לתזכורת שבוע לפני שהגלריה נמחקת בוואטסאפ)</label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="050-1234567"
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
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
                <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 bg-chip">
                  <div>
                    <div className="text-sm font-semibold">אפשרות העלאת תמונות ע&quot;י הלקוח/ה</div>
                    <div className="text-xs text-ink-soft mt-0.5">כשמופעל, הלקוח/ה יוכלו להעלות תמונות משלהם ישירות לגלריה</div>
                  </div>
                  <button
                    onClick={() => setAllowClientUpload(!allowClientUpload)}
                    role="switch"
                    aria-checked={allowClientUpload}
                    className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
                    style={{
                      background: allowClientUpload ? "var(--color-amber-deep)" : "var(--color-line)",
                      justifyContent: allowClientUpload ? "flex-start" : "flex-end",
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
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
