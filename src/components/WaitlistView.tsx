"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { CustomPackageRow, WaitlistRow } from "@/lib/types";
import { openWhatsApp } from "@/lib/waLink";
import PageGuide from "@/components/PageGuide";

const NewEventModal = dynamic(() => import("@/components/NewEventModal"), { ssr: false });

const RESOLUTION_OPTIONS = ["שלחתי צלם אחר", "שלחתי צוות שלם"];

export default function WaitlistView({
  initialEntries,
  customPackages,
}: {
  initialEntries: WaitlistRow[];
  customPackages: CustomPackageRow[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [convertEntry, setConvertEntry] = useState<WaitlistRow | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<WaitlistRow | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<WaitlistRow | null>(null);

  const remove = async (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setDeleteEntry(null);
    await fetch(`/api/waitlist/${id}`, { method: "DELETE" });
  };

  return (
    <div className="pb-8">
      <Link href="/" className="flex items-center gap-1 text-sm mb-5 text-ink-soft">
        → חזרה לדף הבית
      </Link>
      <h1 className="text-[26px] font-bold mb-1.5 font-display">רשימת המתנה</h1>
      <PageGuide
        pageKey="waitlist"
        blurb="כשלקוח מבקש תאריך שכבר תפוס, המערכת מציעה להוסיף אותו לרשימת המתנה. ברגע שהתאריך מתפנה, הופכים אותו לאירוע בלחיצה."
      />

      {entries.length === 0 && (
        <div className="text-center py-16 text-sm text-ink-soft">
          אין ממתינים כרגע, כשלקוח מבקש תאריך שכבר תפוס תופיע כאן אפשרות להוסיף אותו לרשימה
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl p-4 bg-card border border-line shadow-card">
            <div className="flex items-start justify-between gap-2 mb-2.5">
              <div>
                <div className="font-semibold text-sm">{entry.client_name}</div>
                <div className="text-xs text-ink-soft font-data">
                  {new Date(entry.requested_date).toLocaleDateString("he-IL")}
                  {entry.client_phone && ` · ${entry.client_phone}`}
                </div>
              </div>
            </div>
            {entry.notes && <p className="text-xs text-ink-soft mb-2.5">{entry.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setConvertEntry(entry)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-ink text-white"
              >
                התאריך התפנה, יצירת אירוע
              </button>
              <button
                onClick={() => setConfirmEntry(entry)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-deep text-white"
              >
                אישור האירוע
              </button>
              <button
                onClick={() => setDeleteEntry(entry)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-rose"
              >
                מחיקת האירוע
              </button>
            </div>
          </div>
        ))}
      </div>

      {convertEntry && (
        <NewEventModal
          onClose={() => setConvertEntry(null)}
          waitlistId={convertEntry.id}
          customPackages={customPackages}
          initial={{
            clientName: convertEntry.client_name,
            clientPhone: convertEntry.client_phone ?? undefined,
            eventDate: convertEntry.requested_date,
          }}
        />
      )}

      {confirmEntry && (
        <ConfirmEventDialog
          entry={confirmEntry}
          onClose={() => setConfirmEntry(null)}
          onConfirmed={() => {
            router.push("/");
            router.refresh();
          }}
        />
      )}

      {deleteEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(28, 27, 25, 0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={() => setDeleteEntry(null)}
        >
          <div className="w-[85%] max-w-md rounded-3xl p-5 pb-6 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">למחוק את {deleteEntry.client_name}?</h2>
            <p className="text-sm text-ink-soft mb-5">הרשומה תוסר לצמיתות מרשימת ההמתנה.</p>
            <div className="flex gap-2">
              <button
                onClick={() => remove(deleteEntry.id)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white"
              >
                כן, מחיקה
              </button>
              <button
                onClick={() => setDeleteEntry(null)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmEventDialog({
  entry,
  onClose,
  onConfirmed,
}: {
  entry: WaitlistRow;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [selected, setSelected] = useState<string>(RESOLUTION_OPTIONS[0]);
  const [customText, setCustomText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCustom = selected === "custom";
  const resolution = isCustom ? customText.trim() : selected;

  const confirm = async () => {
    if (!resolution) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/waitlist/${entry.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "שגיאה באישור האירוע");
      setSaving(false);
      return;
    }
    const data: { id: string; clientAccessToken: string } = await res.json();
    if (entry.client_phone) {
      const formattedDate = new Date(entry.requested_date).toLocaleDateString("he-IL");
      const portalLink = `${window.location.origin}/portal/${data.clientAccessToken}`;
      const message =
        `שלום ${entry.client_name},\nהאירוע שלכם נסגר במערכת בהצלחה 🎉\n\n` +
        `תאריך: ${formattedDate}\n\n` +
        `הפורטל האישי שלכם לצפייה בפרטי האירוע והתשלומים:\n${portalLink}`;
      openWhatsApp(entry.client_phone, message);
      fetch(`/api/events/${data.id}/log-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `נשלחה הודעת וואטסאפ (אישור הזמנה + קישור פורטל) ל-${entry.client_phone}` }),
      }).catch(() => {});
    }
    onConfirmed();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(28, 27, 25, 0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      <div className="w-[85%] max-w-md rounded-3xl p-5 pb-6 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-2 font-display">אישור האירוע: {entry.client_name}</h2>
        <p className="text-xs text-ink-soft mb-4">
          התאריך ({new Date(entry.requested_date).toLocaleDateString("he-IL")}) כבר תפוס, איך האירוע כוסה?
        </p>
        <div className="space-y-2 mb-3">
          {RESOLUTION_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 text-sm rounded-lg border border-line bg-white px-3 py-2.5 cursor-pointer"
            >
              <input type="radio" name="resolution" checked={selected === option} onChange={() => setSelected(option)} />
              {option}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm rounded-lg border border-line bg-white px-3 py-2.5 cursor-pointer">
            <input type="radio" name="resolution" checked={isCustom} onChange={() => setSelected("custom")} />
            טקסט חופשי
          </label>
          {isCustom && (
            <input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="לדוגמה: חברת צילום חיצונית"
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
              autoFocus
            />
          )}
        </div>

        {error && <p className="text-xs text-rose mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={confirm}
            disabled={saving || !resolution}
            className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
          >
            {saving ? "מאשר..." : "אישור והעברה לאירועים"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
