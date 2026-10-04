"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPhotographerRow } from "@/app/admin/page";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import { useT, useLang } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";

// Admin dashboard › accounts whose payment didn't come through, and a search over every account,
// with a lock / unlock button (owner's decision, 2026-09-29: locking is manual). Locked = past_due:
// the account lands on /billing ("עדכון אמצעי תשלום"), and paying there opens it again by itself.

const DAY = 86_400_000;
const OTHER_STATUS: Record<string, string> = { trialing: "בתקופת ניסיון", canceled: "בוטל", incomplete: "לא הושלם" };

// An active account whose paid period already ended: a successful charge would have moved
// current_period_end forward (PayPlus sends nothing when a recurring charge fails).
function isOverdue(p: AdminPhotographerRow, now: number) {
  return p.subscription_status === "active" && !p.cancel_at_period_end && !!p.current_period_end && new Date(p.current_period_end).getTime() < now;
}

function Row({ p, now, onToggle, busy }: { p: AdminPhotographerRow; now: number; onToggle: (p: AdminPhotographerRow) => void; busy: boolean }) {
  const t = useT();
  const lang = useLang();
  const locked = p.subscription_status === "past_due";
  const canToggle = locked || p.subscription_status === "active";
  const end = p.current_period_end ? new Date(p.current_period_end) : null;
  const daysLate = end ? Math.floor((now - end.getTime()) / DAY) : 0;
  return (
    <div className="rounded-xl px-3.5 py-2.5 bg-chip flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">
          {p.name}
          {locked && <span className="text-xs font-semibold text-rose ms-2">{t("נעול")}</span>}
        </div>
        <div className="text-xs text-ink-soft break-all">{p.email}</div>
        <div className="text-xs text-ink-soft mt-0.5">
          {t("מסלול {plan}", { plan: t(SUBSCRIPTION_PLANS[p.plan].label) })}
          {end && (
            <>
              {" · "}
              {t("שולם עד")} <span className="font-data">{end.toLocaleDateString(dateLocale(lang))}</span>
              {daysLate > 0 && <span className="text-rose">{t(" (לפני {n} ימים)", { n: daysLate })}</span>}
            </>
          )}
          {!p.has_recurring && p.subscription_status === "active" && t(" · אין הוראת קבע")}
        </div>
      </div>
      {!canToggle && <span className="text-xs text-ink-soft shrink-0">{OTHER_STATUS[p.subscription_status] ? t(OTHER_STATUS[p.subscription_status]) : p.subscription_status}</span>}
      {canToggle && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggle(p)}
          className={`text-[13px] font-bold h-9 px-3 rounded-lg shrink-0 disabled:opacity-60 ${locked ? "border border-line bg-white" : "bg-ink text-white"}`}
        >
          {locked ? t("הסרת נעילה") : t("נעילה")}
        </button>
      )}
    </div>
  );
}

export default function AdminPaymentLocks({ photographers }: { photographers: AdminPhotographerRow[] }) {
  const router = useRouter();
  const t = useT();
  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const attention = photographers.filter((p) => p.subscription_status === "past_due" || isOverdue(p, now));
  const q = query.trim().toLowerCase();
  const results = q.length >= 2 ? photographers.filter((p) => p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)).slice(0, 20) : [];

  async function toggle(p: AdminPhotographerRow) {
    const lock = p.subscription_status !== "past_due";
    const ok = window.confirm(
      lock
        ? t("לנעול את החשבון של {name}? המערכת תיחסם עבורו ויופיע לו מסך \"עדכון אמצעי תשלום\". תשלום שם יפתח את החשבון מחדש.", { name: p.name })
        : t("להסיר את הנעילה מהחשבון של {name}? החשבון ייפתח לשימוש בלי תשלום.", { name: p.name })
    );
    if (!ok) return;
    setBusyId(p.id);
    setError("");
    try {
      const res = await fetch("/api/admin/subscription-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photographerId: p.id, locked: lock }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? t("הפעולה נכשלה"));
      else router.refresh();
    } catch {
      setError(t("הפעולה נכשלה, נסו שוב"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold mb-1">{t("חשבונות שלא העבירו תשלום ({n})", { n: attention.length })}</div>
      <p className="text-xs text-ink-soft mb-3">
        {t("מנוי פעיל שהתקופה ששולמה שלו הסתיימה בלי חיוב שנקלט, וחשבונות נעולים. נעילה מפנה את הלקוח למסך עדכון אמצעי תשלום, ותשלום שם פותח את החשבון מחדש.")}
      </p>
      {attention.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-soft">{t("כל החשבונות שילמו.")}</p>
      ) : (
        <div className="space-y-2">
          {attention.map((p) => (
            <Row key={p.id} p={p} now={now} onToggle={toggle} busy={busyId === p.id} />
          ))}
        </div>
      )}

      <div className="text-sm font-semibold mt-5 mb-2">{t("חיפוש משתמש")}</div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("שם או אימייל")}
        className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
      />
      {q.length >= 2 && (
        <div className="space-y-2 mt-2">
          {results.length === 0 && <p className="py-2 text-center text-sm text-ink-soft">{t("לא נמצאו משתמשים.")}</p>}
          {results.map((p) => (
            <Row key={p.id} p={p} now={now} onToggle={toggle} busy={busyId === p.id} />
          ))}
        </div>
      )}
      {error && <p className="text-xs text-rose mt-2">{error}</p>}
    </div>
  );
}
