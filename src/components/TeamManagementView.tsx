"use client";

import { useEffect, useState } from "react";
import type { TeamMember } from "@/lib/types";

export default function TeamManagementView({
  initialTeamMembers,
  limit,
}: {
  initialTeamMembers: TeamMember[];
  limit: number;
}) {
  const [teamMembers, setTeamMembers] = useState(initialTeamMembers);

  // SettingsTabs keeps every tab mounted at once (display:none, never unmounted), so this
  // useState-from-props only ever runs its lazy initializer on the first mount — a change from a
  // different tab that triggers router.refresh() sends fresh props down here too, but without
  // this they'd sit unused until a hard reload. Same pattern as ClientMessagesSettings.
  useEffect(() => setTeamMembers(initialTeamMembers), [initialTeamMembers]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

  const addTeamMember = async () => {
    if (!name || !email) return;
    setSaving(true);
    setError(null);
    setCreatedCredentials(null);

    const res = await fetch("/api/team-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "שגיאה בהוספת חבר צוות");
      return;
    }

    setTeamMembers((prev) => [...prev, { id: data.id, photographer_id: "", name, email, created_at: new Date().toISOString() }]);
    setCreatedCredentials({ email: data.email, password: data.password });
    setName("");
    setEmail("");
  };

  const removeTeamMember = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/team-members/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "שגיאה בהסרת חבר צוות");
      return;
    }
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold tracking-wide mb-3.5">צוות (עורכים/עוזרים)</div>

      {teamMembers.length > 0 && (
        <div className="space-y-2 mb-4">
          {teamMembers.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl px-3.5 py-2.5 bg-chip text-sm">
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-ink-soft font-data">{m.email}</div>
              </div>
              <button onClick={() => removeTeamMember(m.id)} className="text-xs text-rose">
                הסרה
              </button>
            </div>
          ))}
        </div>
      )}

      {createdCredentials && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-sage-bg text-sage space-y-1">
          <div>חבר הצוות נוצר. שתפו אליו את פרטי ההתחברות (מוצג פעם אחת בלבד):</div>
          <div className="font-data">אימייל: {createdCredentials.email}</div>
          <div className="font-data">סיסמה: {createdCredentials.password}</div>
        </div>
      )}

      {teamMembers.length >= limit ? (
        <p className="text-xs text-ink-soft">
          {limit === 1
            ? "ניתן להוסיף עוזר אחד בלבד לכל חשבון. כדי להוסיף עוזר אחר, יש להסיר קודם את הקיים."
            : `הגעתם למכסת ${limit} חברי הצוות של מסלול פרו+. כדי להוסיף חבר צוות אחר, יש להסיר קודם אחד מהקיימים.`}
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שם</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          {error && <p className="text-xs text-rose">{error}</p>}
          <button
            onClick={addTeamMember}
            disabled={saving}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
          >
            {saving ? "מוסיף..." : "הוספת חבר צוות"}
          </button>
        </div>
      )}
    </div>
  );
}
