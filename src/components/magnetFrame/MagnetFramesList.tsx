"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BodyPortal from "@/components/BodyPortal";
import MagnetFramePreview from "@/components/magnetFrame/MagnetFramePreview";
import type { MagnetQrContext } from "@/lib/magnetQr";
import MagnetApprovalChip from "@/components/magnetFrame/MagnetApprovalChip";
import SendForApprovalSheet, { canSendForApproval } from "@/components/magnetFrame/SendForApprovalSheet";
import { magnetApprovalStatus, type MagnetClientInfo } from "@/lib/magnetApproval";
import { ALBUM_FONT_CLASS_NAMES } from "@/lib/albumFonts";
import { DEFAULT_MAGNET_FRAME_SETTINGS, DEFAULT_MAGNET_SIZE, MAGNET_FRAME_SIZES, magnetDesignDimensions, magnetSizeLabel } from "@/lib/magnetFrameShared";
import { BLANK_TEMPLATE_KEY, MAGNET_FRAME_TEMPLATES, findMagnetFrameTemplate, instantiateTemplate, templateKinds, type MagnetTemplateKind } from "@/lib/magnetFrameTemplates";
import { useModalEntered } from "@/lib/useModalEntered";
import type { MagnetFrameCustomElementRow, MagnetFrameCustomTextureRow, MagnetFrameDesignRow, MagnetFrameElement, MagnetFrameSettings, MagnetFrameSizeKey } from "@/lib/types";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";

// The photographer's magnet frames (owner, 2026-10-22: several frames per account, a frame per
// event, starting from ready-made templates, several print sizes). Each card shows the frame as it
// will be exported; the new-frame dialog picks a name, an event, a size and a template.

export type MagnetFrameListItem = MagnetFrameDesignRow & { event: { id: string; client_name: string; event_date: string } | null };
export type MagnetFrameEventOption = { id: string; label: string; clientName: string; date: string; eventType: string | null };

// A size like "20×15" inside Hebrew text is laid out right-to-left and reads "15×20". Isolating it
// left-to-right keeps width × height in order (same as the editor).
function Dim({ children }: { children: string }) {
  return (
    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
      {children}
    </span>
  );
}

// Why each size: shown under the size picker.
const SIZE_HINTS: Record<MagnetFrameSizeKey, string> = {
  "20x15": "המסגרת הגדולה, כמו עד היום",
  "10x7.5": "גודל המגנט עצמו",
  "15x10": "גודל נפוץ בתוכנות להדפסת מגנטים",
  "10x7": "גודל נפוץ בתוכנות להדפסת מגנטים",
  "9x9": "מגנט ריבועי, מסגרת אחת בלבד",
};

// The template kind an event's type suggests, so its templates come first.
function kindOfEventType(eventType: string | null | undefined): MagnetTemplateKind | null {
  const s = eventType ?? "";
  if (s.includes("חינה")) return "henna";
  if (s.includes("חתונ")) return "wedding";
  if (/בת[\s-]?ה?מצו/.test(s)) return "bat_mitzvah";
  if (/בר[\s-]?ה?מצו/.test(s) || /עלי[י]?ה לתורה/.test(s)) return "bar_mitzvah";
  if (s.includes("ברית")) return "brit";
  if (s.includes("הולדת")) return "birthday";
  return null;
}

// "2026-06-12" in the viewer's date format, without a time zone shift.
function eventDateLabel(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric" }) : iso;
}

// The custom textures and elements the photographer uploaded, by id → URL. Fetched only when some
// frame on the screen uses one.
function useCustomAssets(designs: MagnetFrameListItem[]) {
  const needsTextures = designs.some((d) => !!d.frame_settings?.customTextureAssetId);
  const needsElements = designs.some((d) => (d.landscape_elements ?? []).some((el) => el.type === "decoration" && !!el.customElementAssetId));
  const [textures, setTextures] = useState<Record<string, string | null>>({});
  const [elements, setElements] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!needsTextures) return;
    let cancelled = false;
    fetch("/api/magnet-frames/textures")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { textures: (MagnetFrameCustomTextureRow & { url: string | null })[] } | null) => {
        if (!cancelled && data) setTextures(Object.fromEntries(data.textures.map((tx) => [tx.id, tx.url])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsTextures]);
  useEffect(() => {
    if (!needsElements) return;
    let cancelled = false;
    fetch("/api/magnet-frames/elements")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { elements: (MagnetFrameCustomElementRow & { url: string | null })[] } | null) => {
        if (!cancelled && data) setElements(Object.fromEntries(data.elements.map((el) => [el.id, el.url])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsElements]);
  return { textures, elements };
}

// A frame on a soft backdrop, in a 4:3 box whatever its size, so cards line up (a square frame
// stands narrower in the middle).
function FrameThumb({
  settings,
  elements,
  customTextureUrl,
  customElementUrls,
  qrContext,
  padding = "p-3 sm:p-4",
}: {
  settings: MagnetFrameSettings;
  elements: MagnetFrameElement[];
  customTextureUrl?: string | null;
  customElementUrls?: Record<string, string | null>;
  // What a QR on the frame opens (a frame's own event and the portfolio).
  qrContext?: MagnetQrContext;
  padding?: string;
}) {
  const { widthPx, heightPx } = magnetDesignDimensions("landscape", settings.sizeKey);
  const widthShare = Math.min(1, widthPx / heightPx / (4 / 3)) * 100;
  return (
    <div className={`rounded-xl ${padding}`} style={{ background: "var(--color-chip)" }}>
      <div className="aspect-[4/3] flex items-center justify-center">
        <div style={{ width: `${widthShare}%`, boxShadow: "0 1px 2px rgba(0,0,0,0.12), 0 4px 14px rgba(0,0,0,0.14)" }}>
          <MagnetFramePreview orientation="landscape" settings={settings} elements={elements} customTextureUrl={customTextureUrl} customElementUrls={customElementUrls} qrContext={qrContext} />
        </div>
      </div>
    </div>
  );
}

function DotsGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// A small sheet on the screen (BodyPortal: a fixed layer inside a glass card is placed against the
// card, not the screen).
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const t = useT();
  const entered = useModalEntered();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <BodyPortal>
      <div
        className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 ${ALBUM_FONT_CLASS_NAMES}`}
        style={{
          background: "rgba(28, 27, 25, 0.45)",
          backdropFilter: entered ? "blur(12px)" : "blur(0px)",
          WebkitBackdropFilter: entered ? "blur(12px)" : "blur(0px)",
          transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
        }}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-md"} max-h-[92dvh] sm:max-h-[88dvh] rounded-t-3xl sm:rounded-3xl bg-paper shadow-sheet flex flex-col`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <h2 className="text-lg font-bold font-display">{title}</h2>
            <button onClick={onClose} aria-label={t("סגירה")} className="h-9 w-9 rounded-full flex items-center justify-center text-ink-soft" style={{ background: "var(--color-chip)" }}>
              <CloseGlyph />
            </button>
          </div>
          {children}
        </div>
      </div>
    </BodyPortal>
  );
}

// The templates: chips by event kind over one grid, "ריק" always first. `initialKind` (the chosen
// event's kind) opens on that kind's templates.
function TemplateGallery({
  sizeKey,
  fill,
  selected,
  onPick,
  initialKind,
  wide = false,
}: {
  sizeKey: MagnetFrameSizeKey;
  fill?: { names: string; date: string };
  selected: string | null;
  onPick: (key: string) => void;
  initialKind: MagnetTemplateKind | null;
  wide?: boolean;
}) {
  const t = useT();
  const [kind, setKind] = useState<MagnetTemplateKind | "all">(initialKind ?? "all");
  const fillNames = fill?.names ?? "";
  const fillDate = fill?.date ?? "";
  const previews = useMemo(() => {
    const parts = fillNames || fillDate ? { names: fillNames, date: fillDate } : undefined;
    return Object.fromEntries([BLANK_TEMPLATE_KEY, ...MAGNET_FRAME_TEMPLATES.map((tpl) => tpl.key)].map((key) => [key, instantiateTemplate(key, sizeKey, parts)]));
  }, [sizeKey, fillNames, fillDate]);
  const kindLabel = Object.fromEntries(templateKinds.map((k) => [k.key, k.label]));
  const shown = MAGNET_FRAME_TEMPLATES.filter((tpl) => kind === "all" || tpl.kind === kind);

  const chip = (key: MagnetTemplateKind | "all", label: string) => {
    const on = kind === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setKind(key)}
        aria-pressed={on}
        className="rounded-full px-3 py-1.5 text-xs font-semibold"
        style={{ background: on ? "var(--color-ink)" : "var(--color-chip)", color: on ? "var(--color-paper)" : "var(--color-ink-soft)" }}
      >
        {label}
      </button>
    );
  };

  const card = (key: string, label: string, sub?: string) => {
    const on = selected === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onPick(key)}
        aria-pressed={on}
        aria-label={sub ? `${label} · ${sub}` : label}
        className="text-start rounded-2xl p-1.5 transition-colors min-w-0"
        style={{ background: on ? "var(--color-amber-bg)" : "transparent", outline: on ? "2px solid var(--color-amber-deep)" : "1px solid var(--color-line)", outlineOffset: on ? 0 : -1 }}
      >
        <FrameThumb settings={previews[key].frameSettings} elements={previews[key].elements} padding="p-2" />
        <div className="text-xs mt-1.5 px-1 truncate">
          <span className="font-semibold" style={{ color: on ? "var(--color-amber-deep)" : undefined }}>
            {label}
          </span>
          {sub && <span className="text-ink-soft"> · {sub}</span>}
        </div>
      </button>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {chip("all", t("הכל"))}
        {templateKinds.map((k) => chip(k.key, t(k.label)))}
      </div>
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${wide ? "lg:grid-cols-4" : ""} gap-2.5`}>
        {card(BLANK_TEMPLATE_KEY, t("ריק, להתחיל מאפס"))}
        {shown.map((tpl) => card(tpl.key, t(tpl.name), kind === "all" ? t(kindLabel[tpl.kind]) : undefined))}
      </div>
    </div>
  );
}

function NewFrameDialog({
  events,
  initialEventId,
  initialTemplateKey,
  onClose,
}: {
  events: MagnetFrameEventOption[];
  initialEventId: string;
  initialTemplateKey: string;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [eventId, setEventId] = useState(initialEventId);
  const event = events.find((e) => e.id === eventId) ?? null;
  const [name, setName] = useState(event?.clientName ?? "");
  const [nameTouched, setNameTouched] = useState(false);
  const [sizeKey, setSizeKey] = useState<MagnetFrameSizeKey>(DEFAULT_MAGNET_SIZE);
  const [templateKey, setTemplateKey] = useState(initialTemplateKey);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fill = event ? { names: event.clientName, date: event.date } : undefined;

  const changeEvent = (id: string) => {
    setEventId(id);
    // The name follows the event until the photographer types one.
    if (!nameTouched) setName(events.find((e) => e.id === id)?.clientName ?? "");
  };

  const create = async () => {
    setCreating(true);
    setError(null);
    const { frameSettings, elements } = instantiateTemplate(templateKey, sizeKey, fill);
    try {
      const res = await fetch("/api/magnet-frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, eventId: eventId || null, elements, frameSettings }),
      });
      const data: { design?: MagnetFrameListItem; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.design) throw new Error(data.error);
      router.push(`/magnet-frames/${data.design.id}`);
    } catch {
      setError(t("השמירה נכשלה. נסו שוב"));
      setCreating(false);
    }
  };

  return (
    <Modal title={t("מסגרת חדשה")} onClose={onClose} wide>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-ink-soft mb-1.5">{t("שם המסגרת")}</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
              maxLength={80}
              placeholder={t("למשל: מגנטים לחתונה של רותם ודניאל")}
              className="w-full min-w-0 rounded-lg px-3 py-2.5 text-sm border border-line"
              style={{ background: "var(--color-input-bg)" }}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-ink-soft mb-1.5">{t("אירוע (לא חובה)")}</span>
            <select
              value={eventId}
              onChange={(e) => changeEvent(e.target.value)}
              className="w-full min-w-0 rounded-lg px-3 py-2.5 text-sm border border-line"
              style={{ background: "var(--color-input-bg)" }}
            >
              <option value="">{t("ללא אירוע")}</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <div className="text-xs font-semibold text-ink-soft mb-1.5">{t("גודל להדפסה (ס״מ)")}</div>
          <div className="grid grid-cols-5 gap-1.5 sm:max-w-md">
            {MAGNET_FRAME_SIZES.map((s) => {
              const on = s.key === sizeKey;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSizeKey(s.key)}
                  aria-pressed={on}
                  className="rounded-full px-1 py-1.5 text-[13px] sm:text-sm font-semibold font-data"
                  style={{ background: on ? "var(--color-ink)" : "var(--color-chip)", color: on ? "var(--color-paper)" : "var(--color-ink-soft)" }}
                >
                  <Dim>{magnetSizeLabel(s.key, "landscape")}</Dim>
                </button>
              );
            })}
          </div>
          <div className="text-xs text-ink-soft mt-1.5">{t(SIZE_HINTS[sizeKey])}</div>
        </div>

        <div>
          <div className="text-xs font-semibold text-ink-soft mb-2">{t("עיצוב התחלתי")}</div>
          <TemplateGallery
            key={kindOfEventType(event?.eventType) ?? "all"}
            sizeKey={sizeKey}
            fill={fill}
            selected={templateKey}
            onPick={setTemplateKey}
            initialKind={kindOfEventType(event?.eventType)}
          />
        </div>
      </div>
      <div className="px-5 py-3.5 border-t border-line flex items-center gap-2 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        {error ? (
          <div className="flex-1 min-w-0 text-xs text-rose">{error}</div>
        ) : (
          <div className="hidden sm:block flex-1 min-w-0 text-xs text-ink-soft truncate">
            {t("עיצוב: {name}", { name: templateKey === BLANK_TEMPLATE_KEY ? t("ריק, להתחיל מאפס") : t(findMagnetFrameTemplate(templateKey)?.name ?? "") })}
          </div>
        )}
        <div className="flex gap-2 ms-auto">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-semibold bg-white border border-line text-ink">
            {t("ביטול")}
          </button>
          <button type="button" onClick={create} disabled={creating} className="rounded-full px-5 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60">
            {creating ? t("יוצר...") : t("יצירת המסגרת")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CardMenu({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" className="absolute end-0 top-full mt-1 z-30 w-48 rounded-xl border border-line bg-paper shadow-sheet py-1 text-sm">
      {children}
    </div>
  );
}

const menuItemClass = "block w-full text-start px-3.5 py-2 hover:bg-chip";

export default function MagnetFramesList({
  initialDesigns,
  events,
  contactEventIds = [],
  today,
  openNewForEvent,
  portfolioSlug = null,
}: {
  initialDesigns: MagnetFrameListItem[];
  events: MagnetFrameEventOption[];
  // The events whose client has a phone or an email: a frame of one can be sent for approval.
  contactEventIds?: string[];
  // Israel's date ("YYYY-MM-DD"): frames of events from today on come first.
  today: string;
  // From `?new=1&event=<id>`: open the new-frame dialog ("" = with no event), or null.
  openNewForEvent: string | null;
  // The photographer's public portfolio, for a QR that opens it (magnetPortfolioSlug).
  portfolioSlug?: string | null;
}) {
  const t = useT();
  const lang = useLang();
  const locale = dateLocale(lang);
  const [designs, setDesigns] = useState(initialDesigns);
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [assigning, setAssigning] = useState<{ design: MagnetFrameListItem; eventId: string } | null>(null);
  const [deleting, setDeleting] = useState<MagnetFrameListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newDialog, setNewDialog] = useState<{ eventId: string; templateKey: string } | null>(
    openNewForEvent !== null ? { eventId: openNewForEvent, templateKey: BLANK_TEMPLATE_KEY } : null
  );
  const assets = useCustomAssets(designs);
  const hasContact = useMemo(() => new Set(contactEventIds), [contactEventIds]);
  // "שליחה ללקוח לאישור": the message and the client, read when the item is tapped.
  const [sending, setSending] = useState<{ designId: string; info: MagnetClientInfo & { client: NonNullable<MagnetClientInfo["client"]>; message: string } } | null>(null);

  // The dialog opened from the event page's link: drop the query so a refresh doesn't reopen it.
  useEffect(() => {
    if (openNewForEvent !== null) window.history.replaceState(null, "", "/magnet-frames");
  }, [openNewForEvent]);

  const replace = (design: MagnetFrameListItem) => setDesigns((prev) => prev.map((d) => (d.id === design.id ? design : d)));

  // One request; on failure a message above the list. Returns the response body, or null.
  const call = async <T,>(url: string, init: RequestInit): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      return data as T;
    } catch {
      setError(t("השמירה נכשלה. נסו שוב"));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!renaming) return;
    const data = await call<{ design: MagnetFrameListItem }>(`/api/magnet-frames/${renaming.id}`, { method: "PATCH", body: JSON.stringify({ name: renaming.value }) });
    if (data) {
      replace(data.design);
      setRenaming(null);
    }
  };

  const duplicate = async (id: string) => {
    setMenuId(null);
    const data = await call<{ design: MagnetFrameListItem }>(`/api/magnet-frames/${id}/duplicate`, { method: "POST" });
    if (data) setDesigns((prev) => [data.design, ...prev]);
  };

  const saveEvent = async () => {
    if (!assigning) return;
    const data = await call<{ design: MagnetFrameListItem }>(`/api/magnet-frames/${assigning.design.id}`, { method: "PATCH", body: JSON.stringify({ eventId: assigning.eventId || null }) });
    if (data) {
      replace(data.design);
      setAssigning(null);
    }
  };

  const sendToClient = async (d: MagnetFrameListItem) => {
    setMenuId(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/magnet-frames/${d.id}/client`, { cache: "no-store" });
      const info: MagnetClientInfo | null = res.ok ? await res.json() : null;
      if (!info?.client) throw new Error();
      if (canSendForApproval(info)) setSending({ designId: d.id, info });
      else setError(t("אין טלפון או מייל ללקוח"));
    } catch {
      setError(t("לא הצלחנו לטעון את פרטי הלקוח. נסו שוב"));
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async (id: string) => {
    setMenuId(null);
    const data = await call<{ design: MagnetFrameListItem }>(`/api/magnet-frames/${id}`, { method: "PATCH", body: JSON.stringify({ shareWithClient: false }) });
    if (data) replace(data.design);
  };

  const remove = async () => {
    if (!deleting) return;
    const data = await call<{ ok: true }>(`/api/magnet-frames/${deleting.id}`, { method: "DELETE" });
    if (data) {
      setDesigns((prev) => prev.filter((d) => d.id !== deleting.id));
      setDeleting(null);
    }
  };

  // Frames of upcoming events first (by the event's date), then the rest, last edited first.
  const { upcoming, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q ? designs.filter((d) => (d.name ?? "").toLowerCase().includes(q) || (d.event?.client_name ?? "").toLowerCase().includes(q)) : designs;
    const isUpcoming = (d: MagnetFrameListItem) => !!d.event && d.event.event_date >= today;
    return {
      upcoming: shown.filter(isUpcoming).sort((a, b) => a.event!.event_date.localeCompare(b.event!.event_date) || b.updated_at.localeCompare(a.updated_at)),
      rest: shown.filter((d) => !isUpcoming(d)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    };
  }, [designs, query, today]);

  // The assign dialog's options: the event list, plus the frame's own event when it's older.
  const assignOptions = (design: MagnetFrameListItem) =>
    design.event && !events.some((e) => e.id === design.event!.id)
      ? [{ id: design.event.id, label: `${design.event.client_name} · ${eventDateLabel(design.event.event_date, locale)}` }, ...events]
      : events;

  const renderCard = (d: MagnetFrameListItem) => {
    const settings = d.frame_settings ?? DEFAULT_MAGNET_FRAME_SETTINGS;
    const name = d.name || t("מסגרת ללא שם");
    const open = menuId === d.id;
    const approval = magnetApprovalStatus(d);
    return (
      // Raised while its menu is open: the card is a glass layer of its own, so the menu would
      // otherwise slide under the next card.
      <div key={d.id} className={`relative rounded-2xl p-3 bg-card border border-line shadow-card ${open ? "z-20" : ""}`}>
        <Link href={`/magnet-frames/${d.id}`} className="block" aria-label={t("פתיחת {name}", { name })}>
          <FrameThumb
            settings={settings}
            elements={d.landscape_elements ?? []}
            customTextureUrl={settings.customTextureAssetId ? assets.textures[settings.customTextureAssetId] : null}
            customElementUrls={assets.elements}
            qrContext={{ eventId: d.event_id, portfolioSlug }}
          />
        </Link>
        <div className="flex items-start gap-2 mt-3 px-0.5">
          <div className="flex-1 min-w-0">
            {renaming?.id === d.id ? (
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveName();
                }}
              >
                <input
                  autoFocus
                  value={renaming.value}
                  maxLength={80}
                  onChange={(e) => setRenaming({ id: d.id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  placeholder={t("מסגרת ללא שם")}
                  aria-label={t("שם המסגרת")}
                  className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line"
                  style={{ background: "var(--color-input-bg)" }}
                />
                <button type="submit" disabled={busy} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-ink text-white disabled:opacity-60">
                  {t("שמירה")}
                </button>
                <button type="button" onClick={() => setRenaming(null)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-soft">
                  {t("ביטול")}
                </button>
              </form>
            ) : (
              <Link href={`/magnet-frames/${d.id}`} className="block font-semibold text-sm truncate" style={{ color: d.name ? undefined : "var(--color-ink-soft)" }}>
                {name}
              </Link>
            )}
            <div className="text-xs text-ink-soft mt-0.5">
              <Dim>{magnetSizeLabel(settings.sizeKey, "landscape")}</Dim>
              {" · "}
              {t("עודכן {date}", { date: new Date(d.updated_at).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric" }) })}
            </div>
            {d.event && (
              <div className="text-xs mt-1 flex items-center gap-1 min-w-0" style={{ color: "var(--color-amber-deep)" }}>
                <CalendarGlyph />
                <span className="truncate">
                  {d.event.client_name} · {eventDateLabel(d.event.event_date, locale)}
                </span>
              </div>
            )}
            {approval !== "not_shared" && (
              <div className="mt-1.5">
                <MagnetApprovalChip status={approval} />
                {approval === "comment" && d.client_comment && (
                  <p dir="auto" title={d.client_comment} className="text-xs text-ink mt-1 line-clamp-2 [overflow-wrap:anywhere]">
                    &quot;{d.client_comment}&quot;
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuId(open ? null : d.id)}
              aria-label={t("פעולות על המסגרת")}
              aria-haspopup="menu"
              aria-expanded={open}
              className="h-9 w-9 rounded-full flex items-center justify-center text-ink-soft"
              style={{ background: open ? "var(--color-chip)" : "transparent" }}
            >
              <DotsGlyph />
            </button>
            {open && (
              <CardMenu onClose={() => setMenuId(null)}>
                <Link role="menuitem" href={`/magnet-frames/${d.id}`} className={menuItemClass}>
                  {t("פתיחה בעורך")}
                </Link>
                <button
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    setMenuId(null);
                    setRenaming({ id: d.id, value: d.name ?? "" });
                  }}
                >
                  {t("שינוי שם")}
                </button>
                <button role="menuitem" className={menuItemClass} onClick={() => duplicate(d.id)}>
                  {t("שכפול")}
                </button>
                <button
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    setMenuId(null);
                    setAssigning({ design: d, eventId: d.event_id ?? "" });
                  }}
                >
                  {t("שיוך לאירוע")}
                </button>
                {d.event_id &&
                  (hasContact.has(d.event_id) ? (
                    <button role="menuitem" className={menuItemClass} disabled={busy} onClick={() => sendToClient(d)}>
                      {approval === "not_shared" ? t("שליחה ללקוח לאישור") : t("שליחה שוב ללקוח")}
                    </button>
                  ) : (
                    <div role="menuitem" aria-disabled="true" className="px-3.5 py-2 text-ink-soft">
                      {t("שליחה ללקוח לאישור")}
                      <div className="text-[11px]">{t("אין טלפון או מייל ללקוח")}</div>
                    </div>
                  ))}
                {approval !== "not_shared" && (
                  <button role="menuitem" className={menuItemClass} disabled={busy} onClick={() => stopSharing(d.id)}>
                    {t("הפסקת השיתוף")}
                  </button>
                )}
                <button
                  role="menuitem"
                  className={menuItemClass}
                  style={{ color: "var(--color-rose)" }}
                  onClick={() => {
                    setMenuId(null);
                    setDeleting(d);
                  }}
                >
                  {t("מחיקה")}
                </button>
              </CardMenu>
            )}
          </div>
        </div>
      </div>
    );
  };

  const grid = (list: MagnetFrameListItem[]) => <div className="grid grid-cols-1 min-[520px]:grid-cols-2 lg:grid-cols-3 gap-4">{list.map(renderCard)}</div>;

  return (
    <div className={`pb-8 ${ALBUM_FONT_CLASS_NAMES}`}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-[26px] font-bold font-display">{t("מסגרות מגנט")}</h1>
        <button
          type="button"
          onClick={() => setNewDialog({ eventId: "", templateKey: BLANK_TEMPLATE_KEY })}
          className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold bg-ink text-white"
        >
          + {t("מסגרת חדשה")}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl px-3.5 py-2.5 mb-4 text-sm font-medium" style={{ background: "var(--color-rose-bg)", color: "var(--color-rose)" }}>
          {error}
        </div>
      )}

      {designs.length === 0 ? (
        <div>
          <p className="text-sm text-ink-soft mb-4">{t("עוד אין כאן מסגרות. בוחרים עיצוב להתחלה, ובעורך משנים בו הכל: טקסט, צבעים, אלמנטים וגודל.")}</p>
          <TemplateGallery sizeKey={DEFAULT_MAGNET_SIZE} selected={null} onPick={(key) => setNewDialog({ eventId: "", templateKey: key })} initialKind={null} wide />
        </div>
      ) : (
        <>
          {designs.length > 8 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("חיפוש לפי שם המסגרת או הלקוח...")}
              className="w-full min-w-0 rounded-lg px-3 py-2 text-sm border border-line mb-5"
              style={{ background: "var(--color-input-bg)" }}
            />
          )}
          {upcoming.length === 0 && rest.length === 0 && <div className="text-center py-16 text-sm text-ink-soft">{t("לא נמצאו תוצאות")}</div>}
          {upcoming.length > 0 && (
            <section className="mb-7">
              <h2 className="text-sm font-semibold mb-3">{t("לאירועים הקרובים")}</h2>
              {grid(upcoming)}
            </section>
          )}
          {rest.length > 0 && (
            <section>
              {upcoming.length > 0 && <h2 className="text-sm font-semibold mb-3">{t("כל השאר")}</h2>}
              {grid(rest)}
            </section>
          )}
        </>
      )}

      {sending && (
        <SendForApprovalSheet
          designId={sending.designId}
          info={sending.info}
          onShared={(design) => replace(design)}
          onClose={() => setSending(null)}
        />
      )}

      {newDialog && <NewFrameDialog events={events} initialEventId={newDialog.eventId} initialTemplateKey={newDialog.templateKey} onClose={() => setNewDialog(null)} />}

      {assigning && (
        <Modal title={t("שיוך לאירוע")} onClose={() => setAssigning(null)}>
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <p className="text-sm text-ink-soft mb-3">{assigning.design.name || t("מסגרת ללא שם")}</p>
            <select
              value={assigning.eventId}
              onChange={(e) => setAssigning({ ...assigning, eventId: e.target.value })}
              aria-label={t("שיוך לאירוע")}
              className="w-full min-w-0 rounded-lg px-3 py-2.5 text-sm border border-line mb-4"
              style={{ background: "var(--color-input-bg)" }}
            >
              <option value="">{t("ללא אירוע")}</option>
              {assignOptions(assigning.design).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAssigning(null)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
                {t("ביטול")}
              </button>
              <button type="button" onClick={saveEvent} disabled={busy} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                {busy ? t("שומר...") : t("שמירה")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={t("מחיקת המסגרת")} onClose={() => setDeleting(null)}>
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <p className="text-sm mb-1">{t("למחוק את המסגרת \"{name}\"?", { name: deleting.name || t("מסגרת ללא שם") })}</p>
            <p className="text-xs text-ink-soft mb-4">{t("אי אפשר לבטל את המחיקה.")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeleting(null)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
                {t("ביטול")}
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--color-rose)" }}
              >
                {busy ? t("מוחק...") : t("מחיקה")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
