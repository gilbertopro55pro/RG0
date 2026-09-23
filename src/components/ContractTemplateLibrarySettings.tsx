"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ContractTemplateRow } from "@/lib/types";

// A library of multiple reusable contract templates, alongside the existing single
// photographers.custom_contract_terms field. That field stays as the fallback used when an event's
// contract is created without picking a specific template from here (see
// /api/events/[id]/contract), so nothing about the pre-existing single-template flow changes.
export default function ContractTemplateLibrarySettings({
  initialTemplates,
}: {
  initialTemplates: ContractTemplateRow[];
}) {
  const supabase = createClient();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<ContractTemplateRow | "new" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftTerms, setDraftTerms] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openNew = () => {
    setDraftName("");
    setDraftTerms("");
    setError(null);
    setEditing("new");
  };

  const openEdit = (t: ContractTemplateRow) => {
    setDraftName(t.name);
    setDraftTerms(t.terms);
    setError(null);
    setEditing(t);
  };

  const save = async (asNew: boolean) => {
    if (!draftName.trim() || !draftTerms.trim()) {
      setError("יש להזין שם ותוכן לתבנית");
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

    const isUpdate = editing !== "new" && editing !== null && !asNew;
    const { data, error: err } = isUpdate
      ? await supabase
          .from("contract_templates")
          .update({ name: draftName.trim(), terms: draftTerms.trim(), updated_at: new Date().toISOString() })
          .eq("id", (editing as ContractTemplateRow).id)
          .select()
          .single<ContractTemplateRow>()
      : await supabase
          .from("contract_templates")
          .insert({ photographer_id: user.id, name: draftName.trim(), terms: draftTerms.trim() })
          .select()
          .single<ContractTemplateRow>();

    setSaving(false);
    if (err || !data) {
      setError(err?.message ?? "שגיאה בשמירת התבנית");
      return;
    }
    setTemplates((prev) => (isUpdate ? prev.map((t) => (t.id === data.id ? data : t)) : [...prev, data]));
    setEditing(null);
  };

  const deleteTemplate = async (id: string) => {
    setDeletingId(id);
    const { error: err } = await supabase.from("contract_templates").delete().eq("id", id);
    setDeletingId(null);
    setConfirmingDeleteId(null);
    if (err) {
      setError("שגיאה במחיקת התבנית");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold mb-1">ספריית תבניות חוזה</div>
      <p className="text-xs mb-3.5 text-ink-soft">
        שמרו כמה תבניות תנאים כלליים (למשל: חתונה, פרילנס, יום צילום בודד), בשמירת אירוע חדש תוכלו לבחור
        מתוכן ישירות, במקום להשתמש תמיד באותם תנאים.
      </p>

      {templates.length > 0 && (
        <div className="space-y-2 mb-3.5">
          {templates.map((t) =>
            confirmingDeleteId === t.id ? (
              <div key={t.id} className="rounded-xl p-3 bg-[#FBEEEC]">
                <p className="text-xs mb-2.5 text-rose">למחוק את התבנית &quot;{t.name}&quot;?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    disabled={deletingId === t.id}
                    className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white disabled:opacity-60"
                  >
                    {deletingId === t.id ? "מוחק..." : "כן, מחק"}
                  </button>
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    disabled={deletingId === t.id}
                    className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            ) : (
              <div key={t.id} className="rounded-xl p-3 flex items-center justify-between gap-2 bg-chip">
                <button onClick={() => openEdit(t)} className="text-right flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{t.name}</div>
                </button>
                <button onClick={() => setConfirmingDeleteId(t.id)} className="text-xs text-rose shrink-0">
                  מחיקה
                </button>
              </div>
            )
          )}
        </div>
      )}

      <button
        onClick={openNew}
        className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
      >
        + תבנית חדשה
      </button>

      {editing && (
        <div className="mt-3.5 rounded-xl p-3 bg-chip">
          <label className="text-xs block mb-1 text-ink-soft">שם התבנית</label>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="לדוגמה: חתונה"
            className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white mb-2.5"
          />
          <label className="text-xs block mb-1 text-ink-soft">תנאים כלליים</label>
          <textarea
            value={draftTerms}
            onChange={(e) => setDraftTerms(e.target.value)}
            rows={10}
            placeholder="כתבו כאן את התנאים הכלליים של התבנית..."
            className="w-full rounded-lg px-2.5 py-2 text-sm border border-line bg-white leading-relaxed mb-2.5"
          />
          {error && <p className="text-xs text-rose mb-2">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
            >
              {saving ? "שומר..." : editing === "new" ? "יצירת תבנית" : "שמירת שינויים"}
            </button>
            {editing !== "new" && (
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink disabled:opacity-60"
              >
                שמירה כתבנית חדשה
              </button>
            )}
            <button
              onClick={() => setEditing(null)}
              disabled={saving}
              className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
