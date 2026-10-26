"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AnchoredMenu, { type AnchoredMenuItem } from "@/components/AnchoredMenu";
import BodyPortal from "@/components/BodyPortal";
import ReceiptFlow from "@/components/ReceiptFlow";
import { createClient } from "@/lib/supabase/client";
import { openWhatsApp } from "@/lib/waLink";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";
import {
  PAYMENT_FIELDS,
  QUICK_REMINDER_KINDS,
  fullPaymentPatch,
  partialPaymentPatch,
  unpaidPatch,
  type PaymentField,
  type QuickActionsData,
  type QuickReminderKind,
} from "@/lib/eventQuickActions";

// The "פעולות" dropdown on an event (owner, 2026-10-26, lib/eventQuickActions.ts): on each row of
// the home list and on the next-shoot card, phone and desktop. Share the gallery, mark a payment,
// issue a receipt for what was marked as paid, and send a reminder, without opening the event. The
// data (and every client message, ready) is read when the menu opens, so each tap that opens
// WhatsApp opens it right away. Sits inside the row's link: its own taps never open the event.

const LEG_LABEL: Record<PaymentField, string> = { deposit: "מקדמה", balance: "יתרה" };
const REMINDER_LABEL: Record<QuickReminderKind, string> = {
  payment: "תזכורת תשלום",
  songs: "בחירת שירים לקליפ",
  photos: "בחירת תמונות לאלבום",
};
const GALLERY_HINT: Record<"none" | "draft" | "archived", string> = {
  none: "אין גלריה לאירוע",
  draft: "הגלריה עוד לא פורסמה",
  archived: "הגלריה בארכיון",
};

type Sheet = "payment" | "receipt" | "reminder" | null;

export default function EventQuickActions({ eventId, tone = "light" }: { eventId: string; tone?: "light" | "dark" }) {
  const t = useT();
  const locale = dateLocale(useLang());
  const money = (n: number) => formatMoney(n, locale);
  const router = useRouter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<QuickActionsData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [receiptFor, setReceiptFor] = useState<{ field: PaymentField; suggested: number } | null>(null);
  const inflight = useRef<Promise<QuickActionsData | null> | null>(null);

  // Read on hover / touch (so it's usually there by the tap) and again on every open.
  const load = () => {
    if (inflight.current) return inflight.current;
    setLoadFailed(false);
    const run = fetch(`/api/events/${eventId}/quick-actions`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as QuickActionsData;
        setData(next);
        return next;
      })
      .catch(() => {
        setLoadFailed(true);
        return null;
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = run;
    return run;
  };

  // After a change: the menu's data, and the home screen behind it (tags, amounts, the card).
  const changed = () => {
    void load();
    router.refresh();
  };

  const phone = data?.clientPhone?.trim() || null;
  const loadingHint = loadFailed ? t("לא הצלחנו לטעון. נסו שוב.") : t("טוען…");

  const openReceipt = (d: QuickActionsData) => {
    if (d.receipt.legs.length === 1) setReceiptFor({ field: d.receipt.legs[0].field, suggested: d.receipt.legs[0].amount });
    else setSheet("receipt");
  };

  const items: AnchoredMenuItem[] = [
    {
      key: "gallery",
      label: t("שיתוף גלריה"),
      icon: <IconShare />,
      disabled: !data || data.gallery.state !== "ready" || !phone || !data.gallery.message,
      hint: !data
        ? loadingHint
        : data.gallery.state !== "ready"
          ? t(GALLERY_HINT[data.gallery.state])
          : !phone
            ? t("אין טלפון ללקוח")
            : undefined,
      onClick: () => {
        if (!data?.gallery.message || !phone) return;
        openWhatsApp(phone, data.gallery.message);
        fetch(`/api/events/${eventId}/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: data.gallery.stageLabel, clientPhone: phone }),
          keepalive: true,
        }).catch(() => {});
      },
    },
    {
      key: "payment",
      label: t("סימון תשלום"),
      icon: <IconCash />,
      disabled: !data?.payments || (data.payments.deposit.amount <= 0 && data.payments.balance.amount <= 0),
      hint: !data ? loadingHint : !data.payments || (data.payments.deposit.amount <= 0 && data.payments.balance.amount <= 0) ? t("טרם הוגדר מחיר לאירוע") : t("מלא או חלקי"),
      onClick: () => setSheet("payment"),
    },
    {
      key: "receipt",
      label: t("הפקת קבלה"),
      icon: <IconReceipt />,
      disabled: !data || data.receipt.legs.length === 0,
      hint: !data
        ? loadingHint
        : data.receipt.legs.length === 0
          ? t("אחרי סימון תשלום מלא או חלקי")
          : !data.receipt.connected
            ? t("יש לחבר מערכת חשבוניות בהגדרות")
            : t("על {amount} ששולמו", { amount: money(data.receipt.legs.reduce((sum, l) => sum + l.amount, 0)) }),
      onClick: () => {
        if (!data) return;
        if (!data.receipt.connected) router.push("/settings?tab=profile");
        else openReceipt(data);
      },
    },
    {
      key: "reminder",
      label: t("שליחת תזכורת"),
      icon: <IconBell />,
      disabled: !data || !phone,
      hint: !data ? loadingHint : !phone ? t("אין טלפון ללקוח") : t("תשלום, שירים לקליפ או תמונות לאלבום"),
      onClick: () => setSheet("reminder"),
    },
  ];

  const triggerStyle =
    tone === "dark"
      ? { border: "1px solid color-mix(in srgb, var(--vivid-foil) 55%, transparent)", color: "var(--vivid-foil-text)", background: "transparent" }
      : { border: "1px solid var(--color-line)", color: "var(--color-ink)", background: "var(--color-paper)" };

  return (
    // The row around this is a link to the event: taps here (and in the portaled menu and sheets,
    // which React bubbles through this element) stay here.
    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onPointerEnter={() => void load()}
        onTouchStart={() => void load()}
        onFocus={() => void load()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (anchor) return setAnchor(null);
          setAnchor(e.currentTarget);
          void load();
        }}
        className="h-7 ps-2.5 pe-2 rounded-full inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap"
        style={triggerStyle}
      >
        {t("פעולות")}
        <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {anchor && <AnchoredMenu anchor={anchor} items={items} onClose={() => setAnchor(null)} />}

      {sheet === "payment" && data?.payments && (
        <PaymentSheet
          eventId={eventId}
          data={data}
          onChanged={changed}
          onReceipt={() => {
            setSheet(null);
            openReceipt(data);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === "receipt" && data && (
        <SheetFrame title={t("הפקת קבלה")} subtitle={t("על איזה תשלום?")} onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-2">
            {data.receipt.legs.map((leg) => (
              <button
                key={leg.field}
                type="button"
                onClick={() => {
                  setSheet(null);
                  setReceiptFor({ field: leg.field, suggested: leg.amount });
                }}
                className="w-full rounded-xl border border-line bg-white px-4 py-3 flex items-center justify-between text-sm font-semibold"
              >
                <span>{t(LEG_LABEL[leg.field])}</span>
                <span className="font-data">{money(leg.amount)}</span>
              </button>
            ))}
          </div>
        </SheetFrame>
      )}

      {sheet === "reminder" && data && phone && (
        <SheetFrame title={t("שליחת תזכורת")} subtitle={t("בחרו את סוג התזכורת, והוואטסאפ ייפתח עם ההודעה ל{name}.", { name: data.clientName })} onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-2">
            {QUICK_REMINDER_KINDS.map((kind) => {
              const r = data.reminders[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={!r.message}
                  onClick={() => {
                    if (!r.message) return;
                    openWhatsApp(phone, r.message);
                    setSheet(null);
                    fetch(`/api/events/${eventId}/quick-reminder`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ kind }),
                      keepalive: true,
                    })
                      .then(() => router.refresh())
                      .catch(() => {});
                  }}
                  className="w-full rounded-xl border border-line bg-white px-4 py-3 flex items-center gap-3 text-start disabled:opacity-55"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: r.message ? "#25D366" : "var(--color-chip)", color: r.message ? "#ffffff" : "var(--color-ink-soft)" }}>
                    <IconWhatsApp />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{t(REMINDER_LABEL[kind])}</span>
                    <span className="block text-[11.5px] text-ink-soft mt-0.5">
                      {r.blocked ? t(r.blocked) : kind === "payment" && r.amount ? t("פתוח לתשלום: {amount}", { amount: money(r.amount) }) : t("פתיחה בוואטסאפ")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </SheetFrame>
      )}

      {receiptFor && data && (
        <ReceiptFlow
          eventId={eventId}
          field={receiptFor.field}
          suggested={receiptFor.suggested}
          clientName={data.clientName}
          eventType={data.eventType}
          clientPhone={data.clientPhone}
          clientEmail={data.clientEmail}
          fixedAmount
          onIssued={changed}
          onClose={() => setReceiptFor(null)}
        />
      )}
    </span>
  );
}

// Agorot, when there are any, as two digits (like the payment reminder).
function formatMoney(n: number, locale: string): string {
  return `₪${n.toLocaleString(locale, Number.isInteger(n) ? undefined : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A bottom sheet on a phone, a centered window from sm up. ESC or a tap outside closes it.
function SheetFrame({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[135] flex items-end sm:items-center justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={onClose}>
        <div
          role="dialog"
          aria-label={title}
          className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-8 bg-paper shadow-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold font-display">{title}</h2>
              {subtitle && <p className="text-xs text-ink-soft mt-0.5">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label={t("סגירה")} className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-ink-soft bg-white border border-line">
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </BodyPortal>
  );
}

// Each leg (deposit, balance): its state, and marking it fully or partly paid, or back to unpaid,
// with the same writes as the event page's payments (lib/eventQuickActions.ts). A receipt for what
// was just marked is one tap away.
function PaymentSheet({
  eventId,
  data,
  onChanged,
  onReceipt,
  onClose,
}: {
  eventId: string;
  data: QuickActionsData;
  onChanged: () => void;
  onReceipt: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const locale = dateLocale(useLang());
  const money = (n: number) => formatMoney(n, locale);
  const [legs, setLegs] = useState(data.payments!);
  const [partial, setPartial] = useState<{ field: PaymentField; value: string } | null>(null);
  const [busy, setBusy] = useState<PaymentField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const receiptTotal = data.receipt.legs.reduce((sum, l) => sum + l.amount, 0);

  const write = async (field: PaymentField, patch: Record<string, unknown>) => {
    setBusy(field);
    setError(null);
    const { error: updateError } = await createClient().from("event_payments").update(patch).eq("event_id", eventId);
    setBusy(null);
    if (updateError) {
      setError(t("השמירה נכשלה. נסו שוב."));
      return;
    }
    setLegs((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        paid: patch[`${field}_paid`] as boolean,
        paidAmount: (patch[`${field}_paid_amount`] as number | null) ?? null,
      },
    }));
    setPartial(null);
    onChanged();
  };

  return (
    <SheetFrame title={t("סימון תשלום")} subtitle={data.clientName} onClose={onClose}>
      <div className="rounded-2xl border border-line bg-white divide-y divide-[var(--color-line)]">
        {PAYMENT_FIELDS.filter((field) => legs[field].amount > 0).map((field) => {
          const leg = legs[field];
          const isPartial = !leg.paid && (leg.paidAmount ?? 0) > 0;
          const status = leg.paid
            ? t("שולם")
            : isPartial
              ? t("שולם חלקית: {paid} מתוך {total}", { paid: money(leg.paidAmount ?? 0), total: money(leg.amount) })
              : t("לא שולם");
          return (
            <div key={field} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{t(LEG_LABEL[field])}</span>
                <span className="text-sm font-bold font-data">{money(leg.amount)}</span>
              </div>
              <div className="text-xs mt-0.5" style={{ color: leg.paid ? "var(--color-sage)" : isPartial ? "var(--color-amber-deep)" : "var(--color-ink-soft)" }}>
                {status}
              </div>
              {partial?.field === field ? (
                <div className="flex gap-2 mt-2.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    autoFocus
                    value={partial.value}
                    onChange={(e) => setPartial({ field, value: e.target.value })}
                    placeholder={t("כמה שולם?")}
                    className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
                  />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      const patch = partialPaymentPatch(field, Number(partial.value), leg.amount, new Date().toISOString());
                      if (!patch) return setError(t("יש להזין סכום גדול מ-0"));
                      void write(field, patch);
                    }}
                    className="shrink-0 rounded-lg px-4 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                  >
                    {t("אישור")}
                  </button>
                  <button type="button" onClick={() => setPartial(null)} className="shrink-0 rounded-lg px-2 text-sm font-semibold text-ink-soft">
                    {t("ביטול")}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  {!leg.paid && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void write(field, fullPaymentPatch(field, new Date().toISOString()))}
                      className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60"
                    >
                      {busy === field ? t("שומר...") : t("תשלום מלא")}
                    </button>
                  )}
                  {!leg.paid && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setPartial({ field, value: isPartial ? String(leg.paidAmount) : "" })}
                      className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-white border border-line text-ink disabled:opacity-60"
                    >
                      {isPartial ? t("עדכון הסכום ששולם") : t("תשלום חלקי")}
                    </button>
                  )}
                  {(leg.paid || isPartial) && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void write(field, unpaidPatch(field))}
                      className="rounded-lg px-2 py-2 text-xs font-semibold text-ink-soft underline underline-offset-2 disabled:opacity-60"
                    >
                      {t("ביטול הסימון")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-rose mt-2.5">{error}</p>}
      {receiptTotal > 0 && data.receipt.connected && (
        <button type="button" onClick={onReceipt} className="w-full mt-3.5 rounded-xl py-3 text-sm font-semibold border border-line bg-white">
          {t("הפקת קבלה על {amount}", { amount: money(receiptTotal) })}
        </button>
      )}
    </SheetFrame>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function IconShare() {
  return (
    <Svg>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
    </Svg>
  );
}

function IconCash() {
  return (
    <Svg>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </Svg>
  );
}

function IconReceipt() {
  return (
    <Svg>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </Svg>
  );
}

function IconBell() {
  return (
    <Svg>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Svg>
  );
}

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}
