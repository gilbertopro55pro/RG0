"use client";

import NativeDateTimeField from "@/components/NativeDateTimeField";
import { PACKAGE_LABELS } from "@/lib/stages";

export type ScanCandidate = {
  calendarEventId: string;
  summary: string;
  description: string;
  location: string;
  eventDate: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  // Google Calendar has no field for this — always starts empty and is only ever filled in by the
  // photographer here, before confirming.
  arrivalTime: string;
  deposit: number | null;
  balance: number | null;
  // Best-effort auto-parsed from the calendar entry's description (see extractPhone on the API
  // route) — pre-filled here when found, but always editable/correctable like everything else.
  clientPhone: string | null;
  // A PACKAGE_LABELS key, or "custom:<id>" for one of the photographer's own saved packages —
  // same convention NewEventModal's package <select> uses. Defaults to "full" on the results
  // screen; nothing about the calendar entry itself hints at a package, so this is purely a
  // starting point the photographer picks from before confirming.
  pkg: string;
  // Computed server-side (route.ts) — true when this candidate shares its exact date+start+end
  // time with another event already on the books (existing or another candidate in this same
  // scan). NOT treated as a duplicate to hide — a photographer can legitimately be double-booked
  // at the same slot by sending a second (freelance) photographer to cover one of them. Only
  // controls whether the freelance-dispatch checkbox below is shown.
  hasScheduleCollision: boolean;
  // The photographer's own answer to "is this the freelance-covered half of that collision?" —
  // read by EventsListView.tsx (is_freelance column) to badge/tint the created event's card.
  isFreelance: boolean;
};

export type ScanCandidateTextField =
  | "summary"
  | "description"
  | "location"
  | "eventStartTime"
  | "eventEndTime"
  | "arrivalTime"
  | "clientPhone"
  | "pkg";
export type ScanCandidateAmountField = "deposit" | "balance";

// One scanned calendar entry, shown as a selectable card with every field the created event will
// actually use editable right here — title, phone, location, times and notes, not just the
// deposit/balance amounts. Nothing here is auto-parsed data the photographer is stuck with: it's
// all a starting point they can fix before anything is actually created.
export default function ScanCandidateCard({
  candidate,
  selected,
  onToggle,
  onUpdateField,
  onUpdateAmount,
  onToggleFreelance,
  customPackages,
}: {
  candidate: ScanCandidate;
  selected: boolean;
  onToggle: () => void;
  onUpdateField: (field: ScanCandidateTextField, value: string) => void;
  onUpdateAmount: (field: ScanCandidateAmountField, value: string) => void;
  onToggleFreelance: () => void;
  customPackages: { id: string; name: string }[];
}) {
  return (
    <label className="flex items-start gap-2 rounded-xl p-3 bg-chip cursor-pointer">
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <label className="text-[10px] text-ink-soft block mb-0.5">כותרת האירוע</label>
          {/* A single-line <input> never wraps — a long calendar title (common: venue + area
              tacked onto the event name) just scrolled invisibly past the field's own edge, with
              nothing to show it was cut off. A textarea wraps onto as many lines as it needs, so
              the whole title is always visible instead of silently missing its tail end. */}
          <textarea
            value={candidate.summary}
            onChange={(e) => onUpdateField("summary", e.target.value)}
            placeholder="אירוע ללא כותרת"
            rows={2}
            className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold border border-line bg-white resize-none"
          />
        </div>
        <div className="text-xs text-ink-soft font-data">{new Date(candidate.eventDate).toLocaleDateString("he-IL")}</div>
        <div>
          <label className="text-[10px] text-ink-soft block mb-0.5">חבילה</label>
          <select
            value={candidate.pkg}
            onChange={(e) => onUpdateField("pkg", e.target.value)}
            className="w-full rounded-lg px-2 py-1.5 text-xs border border-line bg-white"
          >
            {Object.keys(PACKAGE_LABELS).map((p) => (
              <option key={p} value={p}>
                {PACKAGE_LABELS[p as keyof typeof PACKAGE_LABELS]}
              </option>
            ))}
            {customPackages.map((cp) => (
              <option key={cp.id} value={`custom:${cp.id}`}>
                {cp.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-ink-soft block mb-0.5">טלפון הלקוח</label>
          <input
            type="tel"
            value={candidate.clientPhone ?? ""}
            onChange={(e) => onUpdateField("clientPhone", e.target.value)}
            placeholder="050-1234567"
            className="w-full rounded-lg px-2 py-1.5 text-xs border border-line bg-white font-data"
          />
        </div>
        <div>
          <label className="text-[10px] text-ink-soft block mb-0.5">מיקום האירוע</label>
          <input
            value={candidate.location}
            onChange={(e) => onUpdateField("location", e.target.value)}
            placeholder="לדוגמה: אולמי הגן, ראשון לציון"
            className="w-full rounded-lg px-2 py-1.5 text-xs border border-line bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-ink-soft block mb-0.5">שעת התחלה</label>
            <NativeDateTimeField
              type="time"
              compact
              value={candidate.eventStartTime ?? ""}
              onChange={(v) => onUpdateField("eventStartTime", v)}
              display={candidate.eventStartTime || <span className="text-ink-soft">--:--</span>}
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-ink-soft block mb-0.5">שעת סיום</label>
            <NativeDateTimeField
              type="time"
              compact
              value={candidate.eventEndTime ?? ""}
              onChange={(v) => onUpdateField("eventEndTime", v)}
              display={candidate.eventEndTime || <span className="text-ink-soft">--:--</span>}
            />
          </div>
        </div>
        {candidate.hasScheduleCollision && (
          <div
            className="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed"
            style={{ background: "var(--color-chip-tint)", color: "var(--color-coral-deep)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1">⚠️ יש כבר אירוע אחר באותו תאריך ואותן שעות — לא בהכרח כפילות, יכול להיות שנשלח צלם אחר.</div>
            <label className="flex items-center gap-1.5 cursor-pointer font-medium">
              <input type="checkbox" checked={candidate.isFreelance} onChange={onToggleFreelance} />
              פרילנס-נשלח צלם/צוות
            </label>
          </div>
        )}
        <div>
          <label className="text-[10px] text-ink-soft block mb-0.5">שעת הגעה לצילומי משפחה</label>
          <NativeDateTimeField
            type="time"
            value={candidate.arrivalTime}
            onChange={(v) => onUpdateField("arrivalTime", v)}
            display={candidate.arrivalTime || <span className="text-ink-soft">--:--</span>}
          />
        </div>
        <div>
          <label className="text-[10px] text-ink-soft block mb-0.5">הערות</label>
          <textarea
            value={candidate.description}
            onChange={(e) => onUpdateField("description", e.target.value)}
            rows={2}
            className="w-full rounded-lg px-2 py-1.5 text-xs border border-line bg-white resize-none"
            placeholder="כל מידע נוסף שכדאי לזכור על האירוע"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-ink-soft block mb-0.5">מקדמה (₪)</label>
            <input
              type="number"
              inputMode="decimal"
              value={candidate.deposit ?? ""}
              onChange={(e) => onUpdateAmount("deposit", e.target.value)}
              placeholder="0"
              className="w-full rounded-lg px-2 py-1.5 text-xs border border-line bg-white font-data"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-ink-soft block mb-0.5">יתרה (₪)</label>
            <input
              type="number"
              inputMode="decimal"
              value={candidate.balance ?? ""}
              onChange={(e) => onUpdateAmount("balance", e.target.value)}
              placeholder="0"
              className="w-full rounded-lg px-2 py-1.5 text-xs border border-line bg-white font-data"
            />
          </div>
        </div>
      </div>
    </label>
  );
}
