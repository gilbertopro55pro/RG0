"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PrintHouseEmailRow } from "@/lib/types";

function sortEmails(emails: PrintHouseEmailRow[]): PrintHouseEmailRow[] {
  return [...emails].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Dual-purpose: plain management UI (add/edit/delete/set-default) when used in Settings, or a
// "pick one to send to" radio list (same rows, same CRUD) when embedded in the album's
// send-to-print-house flow via `selectable` — so a photographer never has to leave the album just
// to add or fix a print-house address.
export default function PrintHouseEmailsSettings({
  initialEmails,
  selectable = false,
  selectedId = null,
  onSelect,
  onChange,
  compact = false,
}: {
  initialEmails: PrintHouseEmailRow[];
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChange?: (emails: PrintHouseEmailRow[]) => void;
  compact?: boolean;
}) {
  const supabase = createClient();
  const [emails, setEmails] = useState(() => sortEmails(initialEmails));
  const [formOpen, setFormOpen] = useState<"new" | string | null>(null);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // SettingsTabs keeps every tab mounted at once (display:none, never unmounted), so this
  // useState-from-props only ever runs its lazy initializer on the first mount — a change from a
  // different tab that triggers router.refresh() sends fresh props down here too, but without
  // this they'd sit unused until a hard reload. Same pattern as ClientMessagesSettings.
  useEffect(() => setEmails(sortEmails(initialEmails)), [initialEmails]);

  const applyChange = (next: PrintHouseEmailRow[]) => {
    const sorted = sortEmails(next);
    setEmails(sorted);
    onChange?.(sorted);
    return sorted;
  };

  const startAdd = () => {
    setFormOpen("new");
    setDraftEmail("");
    setDraftLabel("");
    setError(null);
  };

  const startEdit = (row: PrintHouseEmailRow) => {
    setFormOpen(row.id);
    setDraftEmail(row.email);
    setDraftLabel(row.label);
    setError(null);
  };

  const cancelForm = () => {
    setFormOpen(null);
    setError(null);
  };

  const save = async () => {
    const email = draftEmail.trim();
    if (!EMAIL_RE.test(email)) {
      setError("כתובת מייל לא תקינה");
      return;
    }
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setError("יש להתחבר מחדש");
      return;
    }

    if (formOpen && formOpen !== "new") {
      const { data, error } = await supabase
        .from("print_house_emails")
        .update({ email, label: draftLabel.trim() })
        .eq("id", formOpen)
        .select()
        .single<PrintHouseEmailRow>();
      if (error || !data) {
        setSaving(false);
        setError(error?.message ?? "שגיאה בשמירה");
        return;
      }
      applyChange(emails.map((e) => (e.id === data.id ? data : e)));
    } else {
      const isFirst = emails.length === 0;
      const { data, error } = await supabase
        .from("print_house_emails")
        .insert({ photographer_id: user.id, email, label: draftLabel.trim(), is_default: isFirst })
        .select()
        .single<PrintHouseEmailRow>();
      if (error || !data) {
        setSaving(false);
        setError(error?.message ?? "שגיאה בהוספה");
        return;
      }
      applyChange([...emails, data]);
      if (isFirst) onSelect?.(data.id);
    }
    setSaving(false);
    setFormOpen(null);
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    const wasDefault = emails.find((e) => e.id === id)?.is_default ?? false;
    await supabase.from("print_house_emails").delete().eq("id", id);
    let next = emails.filter((e) => e.id !== id);
    // Keep the "there's always a default when the list isn't empty" promise alive after a delete.
    if (wasDefault && next.length > 0) {
      const promote = [...next].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      await supabase.from("print_house_emails").update({ is_default: true }).eq("id", promote.id);
      next = next.map((e) => (e.id === promote.id ? { ...e, is_default: true } : e));
    }
    const sorted = applyChange(next);
    if (selectable && selectedId === id) onSelect?.(sorted[0]?.id ?? "");
    setConfirmingDeleteId(null);
    setDeletingId(null);
  };

  const setDefault = async (id: string) => {
    const current = emails.find((e) => e.is_default);
    if (current && current.id !== id) {
      await supabase.from("print_house_emails").update({ is_default: false }).eq("id", current.id);
    }
    await supabase.from("print_house_emails").update({ is_default: true }).eq("id", id);
    applyChange(emails.map((e) => ({ ...e, is_default: e.id === id })));
  };

  return (
    <div className={compact ? "" : "rounded-2xl p-4 bg-card border border-line shadow-card"}>
      {!compact && (
        <>
          <div className="text-sm font-semibold mb-1">מיילים לבית דפוס</div>
          <p className="text-xs mb-3.5 text-ink-soft">
            כתובות שאליהן אפשר לשלוח את קובצי ה-JPG של האלבום ישירות לבית הדפוס, ישר מתוך העורך.
            הכתובת המסומנת כברירת מחדל מופיעה ראשונה ונבחרת אוטומטית בזמן שליחה.
          </p>
        </>
      )}

      {emails.length > 0 && (
        <div className="space-y-2 mb-3">
          {emails.map((row) =>
            confirmingDeleteId === row.id ? (
              <div key={row.id} className="rounded-xl p-3 bg-chip">
                <p className="text-xs mb-2.5 text-rose">
                  למחוק את הכתובת &quot;{row.label || row.email}&quot;?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => remove(row.id)}
                    disabled={deletingId === row.id}
                    className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white disabled:opacity-60"
                  >
                    {deletingId === row.id ? "מוחק..." : "כן, מחק"}
                  </button>
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    disabled={deletingId === row.id}
                    className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            ) : formOpen === row.id ? (
              <div key={row.id} className="rounded-xl p-3 bg-chip space-y-2">
                <input
                  value={draftEmail}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  placeholder="print@lab.co.il"
                  dir="ltr"
                  className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white text-left"
                />
                <input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  placeholder="תיאור (לדוגמה: פוקוס דפוס)"
                  className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
                />
                {error && <p className="text-xs text-rose">{error}</p>}
                <div className="flex gap-2">
                  <button onClick={save} disabled={saving} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60">
                    {saving ? "שומר..." : "שמירה"}
                  </button>
                  <button onClick={cancelForm} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft">
                    ביטול
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={row.id}
                className={`rounded-xl p-3 flex items-center gap-2 bg-chip ${selectable && selectedId === row.id ? "border-2 border-ink" : ""}`}
              >
                {selectable && (
                  <input
                    type="radio"
                    name="print-house-email"
                    checked={selectedId === row.id}
                    onChange={() => onSelect?.(row.id)}
                    className="shrink-0"
                    aria-label={`בחירת ${row.label || row.email}`}
                  />
                )}
                <button
                  onClick={() => (selectable ? onSelect?.(row.id) : startEdit(row))}
                  className="text-right flex-1 min-w-0"
                >
                  <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                    <span className="truncate">{row.label || row.email}</span>
                    {row.is_default && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white text-ink-soft shrink-0">
                        ברירת מחדל
                      </span>
                    )}
                  </div>
                  {row.label && (
                    <div className="text-xs text-ink-soft font-mono truncate" dir="ltr">
                      {row.email}
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {!row.is_default && (
                    <button onClick={() => setDefault(row.id)} className="text-[11px] text-ink-soft whitespace-nowrap">
                      הגדרה כברירת מחדל
                    </button>
                  )}
                  <button onClick={() => startEdit(row)} className="text-xs text-ink-soft">
                    עריכה
                  </button>
                  <button onClick={() => setConfirmingDeleteId(row.id)} className="text-xs text-rose">
                    מחיקה
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {formOpen === "new" ? (
        <div className="rounded-xl p-3 bg-chip space-y-2">
          <input
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            placeholder="print@lab.co.il"
            dir="ltr"
            className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white text-left"
          />
          <input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="תיאור (לדוגמה: פוקוס דפוס)"
            className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
          />
          {error && <p className="text-xs text-rose">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60">
              {saving ? "שומר..." : "הוספה"}
            </button>
            <button onClick={cancelForm} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft">
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button onClick={startAdd} className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
          + הוספת מייל לבית דפוס
        </button>
      )}
    </div>
  );
}
