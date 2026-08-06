"use client";

import { useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Photographer } from "@/lib/types";
import { GOOGLE_EVENT_COLORS } from "@/lib/googleColors";
import { setHapticsEnabled, subscribeHaptics, getHapticsSnapshot, getHapticsServerSnapshot } from "@/lib/haptics";

export default function ProfileSettingsView({
  photographer,
  googleConnectedNotice,
  googleErrorNotice,
}: {
  photographer: Photographer;
  googleConnectedNotice: boolean;
  googleErrorNotice: boolean;
}) {
  const supabase = createClient();
  const [name, setName] = useState(photographer.name);
  const [phone, setPhone] = useState(photographer.phone);
  const [signature, setSignature] = useState(photographer.whatsapp_signature ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connected, setConnected] = useState(photographer.google_calendar_connected);
  const [disconnecting, setDisconnecting] = useState(false);
  const [colorId, setColorId] = useState(photographer.google_calendar_color_id);
  const [savingColor, setSavingColor] = useState<string | null>(null);
  const hapticsOn = useSyncExternalStore(subscribeHaptics, getHapticsSnapshot, getHapticsServerSnapshot);

  const toggleHaptics = () => {
    setHapticsEnabled(!hapticsOn);
  };

  const saveProfile = async () => {
    setSaving(true);
    await supabase
      .from("photographers")
      .update({ name, phone, whatsapp_signature: signature || null })
      .eq("id", photographer.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const disconnectGoogle = async () => {
    setDisconnecting(true);
    await supabase
      .from("photographers")
      .update({
        google_calendar_connected: false,
        google_access_token: null,
        google_refresh_token: null,
        google_token_expiry: null,
      })
      .eq("id", photographer.id);
    setConnected(false);
    setDisconnecting(false);
  };

  const chooseColor = async (id: string) => {
    setSavingColor(id);
    await supabase.from("photographers").update({ google_calendar_color_id: id }).eq("id", photographer.id);
    setColorId(id);
    setSavingColor(null);
  };

  return (
    <div>
      {googleConnectedNotice && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-sage-bg text-sage">
          יומן Google חובר בהצלחה ✓
        </div>
      )}
      {googleErrorNotice && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-white border border-rose text-rose">
          החיבור ליומן Google נכשל, נסה/י שוב
        </div>
      )}

      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-3.5">פרופיל הצלם</div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שם הצלם</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">
              מספר הטלפון שלך (ממנו יישלחו העדכונים ללקוחות)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">
              חתימה אישית (מופיעה בסוף חוזים, הצעות מחיר, ובעתיד גם בהודעות וואטסאפ)
            </label>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="לדוגמה: בברכה, רועי גלברט — סטודיו רועי גלברט"
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
          >
            {saving ? "שומר..." : saved ? "נשמר ✓" : "שמירה"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-3.5">יומן Google</div>
        {connected ? (
          <div className="space-y-3">
            <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">
              היומן מחובר ✓
            </div>

            <div>
              <div className="text-xs mb-2 text-ink-soft">
                {colorId ? "צבע האירועים ביומן" : "באיזה צבע לשמור את האירועים ביומן?"}
              </div>
              <div className="flex flex-wrap gap-2">
                {GOOGLE_EVENT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => chooseColor(c.id)}
                    disabled={savingColor !== null}
                    title={c.name}
                    className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-60"
                    style={{
                      background: c.hex,
                      boxShadow: colorId === c.id ? "0 0 0 2px #fff, 0 0 0 4px var(--color-ink)" : "none",
                    }}
                  >
                    {colorId === c.id && <span style={{ color: "#1d1d1d" }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={disconnectGoogle}
              disabled={disconnecting}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-rose disabled:opacity-60"
            >
              {disconnecting ? "מתנתק..." : "ניתוק היומן"}
            </button>
          </div>
        ) : (
          <a
            href="/api/google/connect"
            className="w-full flex items-center justify-center rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white"
          >
            התחברות ליומן Google
          </a>
        )}
      </div>

      <div className="rounded-2xl p-4 mt-5 bg-card border border-line shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-wide">רטט במגע (בטלפון בלבד)</div>
            <div className="text-xs text-ink-soft mt-0.5">רטט קצר בכל לחיצה על כפתור</div>
          </div>
          <button
            onClick={toggleHaptics}
            role="switch"
            aria-checked={hapticsOn}
            aria-label="הפעלת רטט במגע"
            className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
            style={{
              background: hapticsOn ? "var(--color-amber-deep)" : "var(--color-line)",
              justifyContent: hapticsOn ? "flex-start" : "flex-end",
            }}
          >
            <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
