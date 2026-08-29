"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventRow } from "@/lib/types";
import { useModalEntered } from "@/lib/useModalEntered";
import { formatDateDMYFromInput } from "@/lib/dateInputFormat";

export default function EditEventModal({
  event,
  onClose,
  onSaved,
}: {
  event: EventRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [clientName, setClientName] = useState(event.client_name);
  const [clientPhone, setClientPhone] = useState(event.client_phone ?? "");
  const [eventDate, setEventDate] = useState(event.event_date);
  const [eventStartTime, setEventStartTime] = useState(event.event_start_time ?? "");
  const [eventEndTime, setEventEndTime] = useState(event.event_end_time ?? "");
  const [eventLocation, setEventLocation] = useState(event.event_location ?? "");
  const [arrivalTime, setArrivalTime] = useState(event.arrival_time ?? "");
  const [notes, setNotes] = useState(event.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateConflict, setDateConflict] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const entered = useModalEntered();

  const submit = async (allowDoubleBooking = false) => {
    if (!clientName || !eventDate) return;
    setSaving(true);
    setError(null);
    setDateConflict(false);

    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName,
        clientPhone,
        eventDate,
        eventStartTime: eventStartTime || null,
        eventEndTime: eventEndTime || null,
        eventLocation,
        arrivalTime,
        notes,
        allowDoubleBooking,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "שגיאה בעדכון האירוע");
      setDateConflict(!!data.conflict);
      return;
    }
    if (data.googleCalendarDisconnected) {
      alert("הפרטים נשמרו, אבל החיבור ליומן Google פג תוקף — יש להתחבר מחדש בהגדרות כדי שהאירועים ימשיכו להסתנכרן.");
    } else if (data.googleCalendarError) {
      alert(`הפרטים נשמרו, אבל לא ניתן היה לעדכן את האירוע ביומן Google (${data.googleCalendarError}).`);
    }

    onSaved();
  };

  const deleteEvent = async () => {
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "שגיאה במחיקת האירוע");
      setDeleting(false);
      return;
    }
    if (data.googleCalendarDisconnected) {
      alert(
        "האירוע נמחק מהמערכת. שימו לב: החיבור ליומן Google פג תוקף, כך שהוא לא הוסר משם — יש להתחבר מחדש בהגדרות ולמחוק אותו ידנית מיומן Google."
      );
    } else if (data.googleCalendarError) {
      alert(
        `האירוע נמחק מהמערכת, אבל לא ניתן היה למחוק אותו מיומן Google (${data.googleCalendarError}). יש למחוק אותו ידנית מיומן Google.`
      );
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: "rgba(46,49,66,0.45)",
        backdropFilter: entered ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered ? "blur(16px)" : "blur(0px)",
        transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold font-display">עריכת פרטי האירוע</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שם הלקוח</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">טלפון הלקוח</label>
            <input
              type="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">תאריך האירוע</label>
            <div className="relative">
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                dir="ltr"
                className={`w-full min-w-0 max-w-full block rounded-lg px-3 py-2 text-sm text-center border border-line bg-white ${eventDate ? "text-transparent" : ""}`}
              />
              {/* A native date input's inline (unfocused) display always uses the browser/OS
                  locale format with no override, which was showing YYYY / MM / DD instead of
                  DD/MM/YYYY — sits on top of the real input (kept fully interactive underneath,
                  just with its own text made transparent) instead of replacing it, so the native
                  calendar popup keeps working exactly as before. */}
              {eventDate && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm" dir="ltr">
                  {formatDateDMYFromInput(eventDate)}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {/* Without dir="ltr" a native time input's own inline value renders right-to-left,
                which reflows it wider than its half of the row and makes it climb onto the
                neighboring field — not a sizing issue, min-w-0 alone doesn't fix it. */}
            <div className="flex-1 min-w-0">
              <label className="text-xs block mb-1 text-ink-soft">שעת התחלה</label>
              <input
                type="time"
                value={eventStartTime}
                onChange={(e) => setEventStartTime(e.target.value)}
                dir="ltr"
                className="w-full min-w-0 max-w-full block rounded-lg px-1.5 py-2 text-sm text-center border border-line bg-white"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs block mb-1 text-ink-soft">שעת סיום</label>
              <input
                type="time"
                value={eventEndTime}
                onChange={(e) => setEventEndTime(e.target.value)}
                dir="ltr"
                className="w-full min-w-0 max-w-full block rounded-lg px-1.5 py-2 text-sm text-center border border-line bg-white"
              />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">מיקום האירוע</label>
            <input
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm text-center border border-line bg-white"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שעת הגעה לצילומי משפחה</label>
            <input
              type="time"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              dir="ltr"
              className="w-full min-w-0 max-w-full block rounded-lg px-3 py-2 text-sm text-center border border-line bg-white"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">הערות</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none"
              placeholder="כל מידע נוסף שכדאי לזכור על האירוע"
            />
          </div>
          {error && <p className="text-xs text-rose">{error}</p>}
          {dateConflict ? (
            <div className="space-y-2 mt-2">
              <button
                onClick={() => submit(true)}
                disabled={saving}
                className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {saving ? "שומר..." : "שמירה בכל זאת (הזמנה כפולה)"}
              </button>
              <button
                onClick={() => setDateConflict(false)}
                className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          ) : (
            <button
              onClick={() => submit()}
              disabled={saving}
              className="w-full rounded-lg py-3 text-sm font-semibold mt-2 bg-ink text-white disabled:opacity-60"
            >
              {saving ? "שומר..." : "שמירת שינויים"}
            </button>
          )}

          <div className="pt-3 mt-2 border-t border-line">
            {confirmingDelete ? (
              <div className="rounded-xl p-3 bg-[#FBEEEC]">
                <p className="text-xs mb-3 text-rose">
                  למחוק את האירוע לצמיתות? כל התשלומים, השלבים וההתראות שלו יימחקו ולא ניתן יהיה לשחזר.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={deleteEvent}
                    disabled={deleting}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-rose text-white disabled:opacity-60"
                  >
                    {deleting ? "מוחק..." : "כן, מחק לצמיתות"}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="w-full rounded-lg py-2.5 text-sm font-semibold text-rose"
              >
                מחיקת האירוע
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
