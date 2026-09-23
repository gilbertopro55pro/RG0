"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PACKAGE_LABELS } from "@/lib/stages";
import type { EventPaymentRow } from "@/lib/types";
import type { AnalyticsEvent } from "@/app/analytics/page";
import PageGuide from "@/components/PageGuide";
import { closingRecognitions } from "@/lib/closeEvent";

const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const HEBREW_MONTHS_SHORT = [
  "ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ",
];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function currency(n: number): string {
  return `₪${n.toLocaleString("he-IL")}`;
}

export default function AnalyticsView({
  events,
  payments,
  initialYear,
  initialMonth,
}: {
  events: AnalyticsEvent[];
  payments: EventPaymentRow[];
  initialYear: number;
  initialMonth: number;
}) {
  const currentYear = initialYear;
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  // "month" scopes the forecast card below to the selected month (default); "year" aggregates the
  // whole selected year instead — the month dropdown is disabled in year scope since it stops
  // mattering. Independent of the 12-months trend chart further down, which always shows a
  // trailing 12-month history regardless of this toggle.
  const [scope, setScope] = useState<"month" | "year">("month");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStep, setShareStep] = useState<"options" | "email">("options");
  const [emailValue, setEmailValue] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // Balance left unpaid at an event's closing, recognized as revenue in the month chosen/derived at
  // closing (see closeEvent.ts). Being recognized, that same balance is removed from the "still due"
  // forecast and the upcoming-payments list below so it is never counted twice.
  const recognitions = useMemo(() => closingRecognitions(events, payments), [events, payments]);
  const recognizedEventIds = useMemo(() => new Set(recognitions.map((r) => r.eventId)), [recognitions]);

  const revenueByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recognitions) map.set(r.month, (map.get(r.month) ?? 0) + r.amount);
    // A partial payment (deposit_paid/balance_paid still false, *_paid_amount set) counts only the
    // amount actually received, not the full declared leg — otherwise revenue would be overstated
    // for anyone paying in installments before the leg is fully settled.
    for (const p of payments) {
      if (p.deposit_paid_at) {
        const d = new Date(p.deposit_paid_at);
        const key = monthKey(d.getFullYear(), d.getMonth() + 1);
        const received = p.deposit_paid ? Number(p.deposit_amount) : Number(p.deposit_paid_amount ?? 0);
        map.set(key, (map.get(key) ?? 0) + received);
      }
      if (p.balance_paid_at) {
        const d = new Date(p.balance_paid_at);
        const key = monthKey(d.getFullYear(), d.getMonth() + 1);
        const received = p.balance_paid ? Number(p.balance_amount) : Number(p.balance_paid_amount ?? 0);
        map.set(key, (map.get(key) ?? 0) + received);
      }
    }
    return map;
  }, [payments, recognitions]);

  const trailing12 = useMemo(() => {
    const months: { year: number; month: number; key: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      let m = selectedMonth - i;
      let y = selectedYear;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      months.push({ year: y, month: m, key: monthKey(y, m), label: HEBREW_MONTHS_SHORT[m - 1] });
    }
    return months;
  }, [selectedYear, selectedMonth]);

  const chartData = trailing12.map((m) => ({ ...m, amount: revenueByMonth.get(m.key) ?? 0 }));
  const maxAmount = Math.max(1, ...chartData.map((m) => m.amount));
  const hasAnyRevenue = chartData.some((m) => m.amount > 0);

  const selectedKey = monthKey(selectedYear, selectedMonth);
  const selectedRevenue = revenueByMonth.get(selectedKey) ?? 0;

  const yearRevenue = useMemo(() => {
    let total = 0;
    for (let m = 1; m <= 12; m++) total += revenueByMonth.get(monthKey(selectedYear, m)) ?? 0;
    return total;
  }, [revenueByMonth, selectedYear]);

  const periodActualRevenue = scope === "year" ? yearRevenue : selectedRevenue;
  const periodLabel = scope === "year" ? `${selectedYear}` : `${HEBREW_MONTHS[selectedMonth - 1]} ${selectedYear}`;

  // Forecast = revenue already received in the period, plus whatever's still unpaid but due
  // (balance_due_date) within that same period — the only due-date field the data model has
  // (EventPaymentRow has no separate deposit due date, so an unpaid deposit with no due date at
  // all can't be attributed to any specific month/year and is excluded here; it still shows in the
  // unscoped "תשלומים צפויים" card below, which is deliberately left as a global, all-time figure).
  const periodForecastExtra = useMemo(() => {
    let total = 0;
    for (const p of payments) {
      if (!p.balance_due_date) continue;
      const due = new Date(p.balance_due_date);
      const dueYear = due.getFullYear();
      const dueMonth = due.getMonth() + 1;
      const inPeriod = scope === "year" ? dueYear === selectedYear : monthKey(dueYear, dueMonth) === selectedKey;
      if (!inPeriod) continue;
      if (!p.deposit_paid) total += Number(p.deposit_amount) - Number(p.deposit_paid_amount ?? 0);
      if (!p.balance_paid && !recognizedEventIds.has(p.event_id)) total += Number(p.balance_amount) - Number(p.balance_paid_amount ?? 0);
    }
    return total;
  }, [payments, scope, selectedYear, selectedKey, recognizedEventIds]);

  const periodForecast = periodActualRevenue + periodForecastExtra;

  const monthTransactions = useMemo(() => {
    const rows: { date: string; clientName: string; label: string; pkg: string; amount: number }[] = [];
    for (const p of payments) {
      const event = eventById.get(p.event_id);
      if (!event) continue;
      const pkgLabel = PACKAGE_LABELS[event.package as keyof typeof PACKAGE_LABELS] ?? event.package;
      if (p.deposit_paid_at && monthKey(new Date(p.deposit_paid_at).getFullYear(), new Date(p.deposit_paid_at).getMonth() + 1) === selectedKey) {
        const received = p.deposit_paid ? Number(p.deposit_amount) : Number(p.deposit_paid_amount ?? 0);
        rows.push({ date: p.deposit_paid_at, clientName: event.client_name, label: p.deposit_paid ? "מקדמה" : "מקדמה (חלקי)", pkg: pkgLabel, amount: received });
      }
      if (p.balance_paid_at && monthKey(new Date(p.balance_paid_at).getFullYear(), new Date(p.balance_paid_at).getMonth() + 1) === selectedKey) {
        const received = p.balance_paid ? Number(p.balance_amount) : Number(p.balance_paid_amount ?? 0);
        rows.push({ date: p.balance_paid_at, clientName: event.client_name, label: p.balance_paid ? "יתרה" : "יתרה (חלקי)", pkg: pkgLabel, amount: received });
      }
    }
    for (const r of recognitions) {
      if (r.month !== selectedKey) continue;
      const event = eventById.get(r.eventId);
      if (!event?.closed_at) continue;
      const pkgLabel = PACKAGE_LABELS[event.package as keyof typeof PACKAGE_LABELS] ?? event.package;
      rows.push({ date: event.closed_at, clientName: event.client_name, label: "יתרה (נוספה בסגירת אירוע)", pkg: pkgLabel, amount: r.amount });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  }, [payments, eventById, selectedKey, recognitions]);

  const monthLabel = `${HEBREW_MONTHS[selectedMonth - 1]} ${selectedYear}`;

  const buildCsv = () => {
    const header = ["תאריך", "שם לקוח", "סוג תשלום", "חבילה", 'סכום (₪)'];
    const lines = [header, ...monthTransactions.map((r) => [
      new Date(r.date).toLocaleDateString("he-IL"),
      r.clientName,
      r.label,
      r.pkg,
      String(r.amount),
    ])];
    const csv = "﻿" + lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const filename = `הכנסות-${monthLabel}.csv`;
    return { csv, filename };
  };

  const downloadCsv = () => {
    const { csv, filename } = buildCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareViaWhatsapp = () => {
    const total = monthTransactions.reduce((sum, r) => sum + r.amount, 0);
    const text = `נתוני הכנסות: ${monthLabel}\n${monthTransactions.length} תשלומים · סה"כ ${currency(total)}\n\nנשלח ממערכת גילברטו`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    setShareOpen(false);
  };

  const shareViaOther = async () => {
    const { csv, filename } = buildCsv();
    const file = new File([csv], filename, { type: "text/csv" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `הכנסות | ${monthLabel}` });
      } catch {
        // user canceled the native share sheet — nothing to do
      }
    } else {
      downloadCsv();
    }
    setShareOpen(false);
  };

  const closeShare = () => {
    setShareOpen(false);
    setShareStep("options");
    setEmailValue("");
    setEmailError(null);
    setEmailSent(false);
  };

  const sendEmailExport = async () => {
    setEmailSending(true);
    setEmailError(null);
    const { csv, filename } = buildCsv();
    const res = await fetch("/api/analytics/export-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailValue.trim(), csv, filename, monthLabel }),
    });
    setEmailSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setEmailError(data.error ?? "שליחת המייל נכשלה");
      return;
    }
    setEmailSent(true);
  };
  const prevDate = new Date(selectedYear, selectedMonth - 2, 1);
  const prevKey = monthKey(prevDate.getFullYear(), prevDate.getMonth() + 1);
  const prevRevenue = revenueByMonth.get(prevKey) ?? 0;
  const delta =
    prevRevenue === 0 ? (selectedRevenue > 0 ? null : 0) : ((selectedRevenue - prevRevenue) / prevRevenue) * 100;

  const upcoming = useMemo(() => {
    const rows: { eventId: string; clientName: string; amount: number; dueDate: string | null; label: string }[] = [];
    // A partial payment already reduced what's actually still owed — list the remainder, not the
    // original full leg amount, or this would double-count what was already received.
    for (const p of payments) {
      const event = eventById.get(p.event_id);
      if (!event) continue;
      if (!p.deposit_paid) {
        const remaining = Number(p.deposit_amount) - Number(p.deposit_paid_amount ?? 0);
        if (remaining > 0) {
          rows.push({ eventId: p.event_id, clientName: event.client_name, amount: remaining, dueDate: p.balance_due_date, label: p.deposit_paid_amount ? "מקדמה (יתרה לתשלום)" : "מקדמה" });
        }
      }
      if (!p.balance_paid && !recognizedEventIds.has(p.event_id)) {
        const remaining = Number(p.balance_amount) - Number(p.balance_paid_amount ?? 0);
        if (remaining > 0) {
          rows.push({ eventId: p.event_id, clientName: event.client_name, amount: remaining, dueDate: p.balance_due_date, label: p.balance_paid_amount ? "יתרה (יתרה לתשלום)" : "יתרה" });
        }
      }
    }
    rows.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    return rows;
  }, [payments, eventById, recognizedEventIds]);

  const upcomingTotal = upcoming.reduce((sum, r) => sum + r.amount, 0);

  const packageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.package, (counts.get(e.package) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([pkg, count]) => ({ pkg, count }))
      .sort((a, b) => b.count - a.count);
  }, [events]);
  const maxPackageCount = Math.max(1, ...packageCounts.map((p) => p.count));

  const years = useMemo(() => {
    const eventYears = events.map((e) => new Date(e.event_date).getFullYear());
    const minYear = Math.min(currentYear, ...(eventYears.length ? eventYears : [currentYear]));
    const list: number[] = [];
    for (let y = minYear; y <= currentYear + 1; y++) list.push(y);
    return list;
  }, [events, currentYear]);

  const barWidth = 20;
  const gap = 6;
  const chartHeight = 110;
  const chartWidth = chartData.length * (barWidth + gap) - gap;

  return (
    <div className="pb-8">
      <Link href="/" className="flex items-center gap-1 text-sm mb-5 tracking-wide text-ink-soft">
        ← חזרה לדף הבית
      </Link>
      <h1 className="text-[26px] font-bold mb-1.5 font-display">ניתוח עסקי</h1>
      <PageGuide
        pageKey="analytics"
        blurb="כאן רואים תמונה עסקית מלאה, הכנסות לפי חודש, תשלומים שממתינים, והתפלגות לפי סוגי חבילות."
      />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-line bg-white p-0.5 shrink-0">
          <button
            onClick={() => setScope("month")}
            className="rounded-md px-3 py-1.5 text-xs sm:text-sm font-semibold"
            style={{
              background: scope === "month" ? "var(--color-amber-deep)" : "transparent",
              color: scope === "month" ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            חודש
          </button>
          <button
            onClick={() => setScope("year")}
            className="rounded-md px-3 py-1.5 text-xs sm:text-sm font-semibold"
            style={{
              background: scope === "year" ? "var(--color-amber-deep)" : "transparent",
              color: scope === "year" ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            שנה
          </button>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          disabled={scope === "year"}
          className="flex-1 min-w-[90px] rounded-lg px-2.5 py-2 text-xs sm:text-sm border border-line bg-white disabled:opacity-40"
        >
          {HEBREW_MONTHS.map((label, i) => (
            <option key={i} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="shrink-0 rounded-lg px-2.5 py-2 text-xs sm:text-sm border border-line bg-white font-data"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShareOpen(true)}
          disabled={monthTransactions.length === 0}
          title="ייצוא לרואה חשבון (CSV)"
          className="shrink-0 rounded-lg px-2.5 py-2 text-xs sm:text-sm font-semibold bg-card border border-line text-ink-soft disabled:opacity-40"
        >
          ייצוא ל-CSV
        </button>
      </div>

      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
        <div className="text-xs text-ink-soft mb-1">צפי הכנסות: {periodLabel}</div>
        <div className="text-xl font-bold font-display">{currency(periodForecast)}</div>
        <div className="text-xs mt-1 text-ink-soft">
          {currency(periodActualRevenue)} התקבל
          {periodForecastExtra > 0 && <> · עוד {currency(periodForecastExtra)} צפוי להתקבל</>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
          <div className="text-xs text-ink-soft mb-1">הכנסה החודש</div>
          <div className="text-xl font-bold font-display">{currency(selectedRevenue)}</div>
          {delta !== null && (
            <div className="text-xs mt-1" style={{ color: delta >= 0 ? "var(--color-sage)" : "var(--color-rose)" }}>
              {delta >= 0 ? "↑" : "↓"} {Math.abs(Math.round(delta))}% מהחודש הקודם
            </div>
          )}
          {delta === null && selectedRevenue > 0 && <div className="text-xs mt-1 text-ink-soft">חודש ראשון עם הכנסה</div>}
        </div>
        <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
          <div className="text-xs text-ink-soft mb-1">תשלומים צפויים (כולל)</div>
          <div className="text-xl font-bold font-display">{currency(upcomingTotal)}</div>
          <div className="text-xs mt-1 text-ink-soft">{upcoming.length} תשלומים ממתינים, בכל התאריכים</div>
        </div>
      </div>

      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-3.5">הכנסות: 12 חודשים אחרונים</div>
        {!hasAnyRevenue && (
          <p className="text-xs text-ink-soft mb-3">
            עוד אין תשלומים מסומנים כ&quot;שולם&quot;, הגרף יתמלא ברגע שתסמנו תשלום ראשון באירוע.
          </p>
        )}
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 24}`} width="100%" height={chartHeight + 24}>
          {chartData.map((m, i) => {
            const barHeight = Math.max(2, (m.amount / maxAmount) * chartHeight);
            const x = i * (barWidth + gap);
            const y = chartHeight - barHeight;
            const isSelected = m.key === selectedKey;
            return (
              <g key={m.key}>
                <title>{`${m.label} ${m.year}: ${currency(m.amount)}`}</title>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={4}
                  fill={isSelected ? "var(--color-amber-deep)" : "rgba(123,127,148,0.25)"}
                />
                {isSelected && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fontSize="9"
                    fill="var(--color-ink)"
                    fontWeight="600"
                  >
                    {m.amount > 0 ? Math.round(m.amount / 100) / 10 + "k" : "0"}
                  </text>
                )}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 14}
                  textAnchor="middle"
                  fontSize="8"
                  fill="var(--color-ink-soft)"
                >
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {packageCounts.length > 0 && (
        <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
          <div className="text-sm font-semibold tracking-wide mb-3.5">חבילות פופולריות</div>
          <div className="space-y-2.5">
            {packageCounts.map(({ pkg, count }) => (
              <div key={pkg}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink">{PACKAGE_LABELS[pkg as keyof typeof PACKAGE_LABELS]}</span>
                  <span className="text-ink-soft font-data">{count}</span>
                </div>
                <div className="h-[6px] rounded-full bg-line">
                  <div
                    className="h-[6px] rounded-full"
                    style={{ width: `${(count / maxPackageCount) * 100}%`, background: "var(--color-amber)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
          <div className="text-sm font-semibold tracking-wide mb-3.5">תשלומים צפויים</div>
          <div className="space-y-2">
            {upcoming.slice(0, 8).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5 bg-chip">
                <div>
                  <span className="text-ink">{r.clientName}</span>
                  <span className="text-ink-soft"> · {r.label}</span>
                </div>
                <div className="text-left">
                  <div className="font-data text-ink">{currency(r.amount)}</div>
                  {r.dueDate && (
                    <div className="text-[10px] text-ink-soft">עד {new Date(r.dueDate).toLocaleDateString("he-IL")}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {shareOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={closeShare}
        >
          <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            {shareStep === "options" && (
              <>
                <h2 className="text-lg font-bold font-display mb-1">שליחת נתוני {monthLabel}</h2>
                <p className="text-xs text-ink-soft mb-4">{monthTransactions.length} תשלומים, איך לשלוח?</p>
                <div className="space-y-2.5">
                  <button
                    onClick={() => setShareStep("email")}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white"
                  >
                    מייל
                  </button>
                  <button
                    onClick={shareViaWhatsapp}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-sage-bg text-sage"
                  >
                    וואטסאפ
                  </button>
                  <button
                    onClick={shareViaOther}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink"
                  >
                    אחר
                  </button>
                </div>
                <button onClick={closeShare} className="w-full text-center mt-4 text-xs text-ink-soft">
                  ביטול
                </button>
              </>
            )}

            {shareStep === "email" && !emailSent && (
              <>
                <h2 className="text-lg font-bold font-display mb-1">שליחה במייל</h2>
                <p className="text-xs text-ink-soft mb-4">נתוני {monthLabel} יישלחו כקובץ מצורף</p>
                <input
                  type="email"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  placeholder="כתובת מייל"
                  autoFocus
                  className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-2"
                />
                {emailError && <p className="text-xs text-rose mb-2">{emailError}</p>}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={sendEmailExport}
                    disabled={emailSending || !emailValue.trim()}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-50"
                  >
                    {emailSending ? "שולח..." : "שלח נתונים"}
                  </button>
                  <button
                    onClick={closeShare}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft"
                  >
                    ביטול
                  </button>
                </div>
              </>
            )}

            {shareStep === "email" && emailSent && (
              <>
                <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium mb-4">
                  הנתונים נשלחו ל-{emailValue.trim()}
                </div>
                <button onClick={closeShare} className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                  סגירה
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
