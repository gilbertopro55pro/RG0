"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HIDDEN_PREFIXES } from "@/components/TopNav";
import ContactReminderDialog from "@/components/ContactReminderDialog";
import { buildWaMeLink } from "@/lib/waLink";
import type { DueContactReminder } from "@/lib/leadContactReminder";
import { announceContactReminder } from "@/lib/contactReminderSync";
import { useLang, useT } from "@/i18n/client";

// A contact reminder that fell due (owner, 2026-10-15; lib/leadContactReminder.ts) pops up on
// whatever screen of the app the photographer is on, like a new lead from the assistant
// (AssistantLeadPopup, drawn above it when both are due). Checked on load, every minute and
// when the app comes back to the foreground. Calling, WhatsApp or opening the leads page closes the
// reminder; "תזכורת אחרת" moves it to another date and time.

const POLL_MS = 60_000;

function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${d}.${m}.${y}`;
}

export default function ContactReminderPopup() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [reminders, setReminders] = useState<DueContactReminder[]>([]);
  const [moving, setMoving] = useState(false);
  const busy = useRef(false);
  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/leads/contact-reminders", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { reminders?: DueContactReminder[] };
      setReminders(data.reminders ?? []);
    } catch {
      // offline: try again on the next tick
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (hidden) return;
    const first = setTimeout(() => void check(), 1500);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hidden, check]);

  if (hidden || reminders.length === 0) return null;
  const lead = reminders[0];

  const save = async (remindAt: string | null) => {
    const res = await fetch(`/api/leads/${lead.id}/contact-reminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remindAt }),
      keepalive: true,
    }).catch(() => null);
    if (!res?.ok) return false;
    announceContactReminder(lead.id, remindAt);
    return true;
  };
  // Handled: the reminder is cleared and the next one (if any) shows.
  const done = (open?: () => void) => {
    open?.();
    setReminders((prev) => prev.slice(1));
    void save(null);
  };

  const facts = [lead.event_type_name, dateLabel(lead.event_date_interest)].filter(Boolean).join(" · ");
  const btn = "flex-1 h-11 rounded-xl text-sm font-semibold";

  return (
    <>
      <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.45)" }} role="dialog" aria-modal="true" aria-label={t("תזכורת ליצירת קשר")}>
        <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--color-amber-deep)" }} />
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--color-amber-deep)" }}>
              {t("תזכורת ליצירת קשר")}
            </span>
          </div>
          <h2 className="text-lg font-bold font-display leading-snug">{lead.name}</h2>
          {facts && <p className="text-sm text-ink-soft mt-0.5">{facts}</p>}
          {lead.phone && (
            <p className="text-sm text-ink-soft mt-0.5" dir="ltr" style={{ textAlign: lang === "he" ? "right" : "left" }}>
              {lead.phone}
            </p>
          )}
          {lead.notes && <p className="text-xs text-ink-soft mt-2 line-clamp-3">{lead.notes}</p>}
          {reminders.length > 1 && <p className="text-xs text-ink-soft mt-2">{t("ועוד {n} תזכורות", { n: reminders.length - 1 })}</p>}
          <div className="flex gap-2 mt-5">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} onClick={() => done()} className={`${btn} bg-ink text-white flex items-center justify-center`}>
                {t("התקשרות")}
              </a>
            )}
            {lead.phone && (
              <a
                href={buildWaMeLink(lead.phone, "")}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => done()}
                className={`${btn} bg-sage text-white flex items-center justify-center`}
              >
                {t("וואטסאפ")}
              </a>
            )}
            <button onClick={() => done(() => router.push("/leads"))} className={`${btn} border border-line bg-white text-ink`}>
              {t("לצפייה בליד")}
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setMoving(true)} className="flex-1 h-10 rounded-xl text-xs font-semibold text-ink-soft underline">
              {t("תזכורת אחרת")}
            </button>
            <button onClick={() => done()} className="flex-1 h-10 rounded-xl text-xs font-semibold text-ink-soft underline">
              {t("סיום, טיפלתי")}
            </button>
          </div>
        </div>
      </div>
      {moving && (
        <ContactReminderDialog
          title={t("תזכורת אחרת")}
          text={t("מתי להזכיר לך ליצור קשר עם {name}?", { name: lead.name })}
          onCancel={() => setMoving(false)}
          onConfirm={async (remindAt) => {
            const ok = await save(remindAt);
            if (ok) {
              setMoving(false);
              setReminders((prev) => prev.slice(1));
            }
            return ok;
          }}
        />
      )}
    </>
  );
}
