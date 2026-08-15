"use client";

import { useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Photographer } from "@/lib/types";
import { GOOGLE_EVENT_COLORS } from "@/lib/googleColors";
import { setHapticsEnabled, subscribeHaptics, getHapticsSnapshot, getHapticsServerSnapshot } from "@/lib/haptics";
import type { AppleCalendarOption } from "@/lib/appleCalendar";
import AppleCalendarGuideModal from "@/components/AppleCalendarGuideModal";

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
  const [appleConnected, setAppleConnected] = useState(photographer.apple_calendar_connected);
  const [appleDisplayName, setAppleDisplayName] = useState(photographer.apple_calendar_display_name);
  const [appleEmail, setAppleEmail] = useState("");
  const [applePassword, setApplePassword] = useState("");
  const [appleCalendars, setAppleCalendars] = useState<AppleCalendarOption[] | null>(null);
  const [appleDiscovering, setAppleDiscovering] = useState(false);
  const [appleSelecting, setAppleSelecting] = useState(false);
  const [appleDisconnecting, setAppleDisconnecting] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [showAppleGuide, setShowAppleGuide] = useState(false);
  const [leadFollowUpEnabled, setLeadFollowUpEnabled] = useState(photographer.lead_follow_up_enabled);
  const [savingLeadFollowUp, setSavingLeadFollowUp] = useState(false);
  const [finbotConnected, setFinbotConnected] = useState(!!photographer.finbot_api_key);
  const [finbotApiKey, setFinbotApiKey] = useState("");
  const [taxStatus, setTaxStatus] = useState(photographer.business_tax_status);
  const [savingInvoicing, setSavingInvoicing] = useState(false);
  const [disconnectingFinbot, setDisconnectingFinbot] = useState(false);
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

  const discoverAppleCalendars = async () => {
    setAppleDiscovering(true);
    setAppleError(null);
    const res = await fetch("/api/apple-calendar/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: appleEmail, appPassword: applePassword }),
    });
    const data = await res.json();
    setAppleDiscovering(false);
    if (!res.ok) {
      setAppleError(data.error ?? "החיבור ל-iCloud נכשל");
      return;
    }
    setAppleCalendars(data.calendars);
  };

  const selectAppleCalendar = async (calendar: AppleCalendarOption) => {
    setAppleSelecting(true);
    setAppleError(null);
    const res = await fetch("/api/apple-calendar/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarUrl: calendar.url, displayName: calendar.displayName }),
    });
    const data = await res.json();
    setAppleSelecting(false);
    if (!res.ok) {
      setAppleError(data.error ?? "החיבור נכשל");
      return;
    }
    setAppleConnected(true);
    setAppleDisplayName(calendar.displayName);
    setAppleCalendars(null);
  };

  const disconnectApple = async () => {
    setAppleDisconnecting(true);
    await supabase
      .from("photographers")
      .update({
        apple_calendar_connected: false,
        apple_calendar_email: null,
        apple_calendar_app_password: null,
        apple_calendar_url: null,
        apple_calendar_display_name: null,
      })
      .eq("id", photographer.id);
    setAppleConnected(false);
    setAppleDisplayName(null);
    setAppleEmail("");
    setApplePassword("");
    setAppleDisconnecting(false);
  };

  const connectFinbot = async () => {
    if (!finbotApiKey.trim()) return;
    setSavingInvoicing(true);
    await supabase
      .from("photographers")
      .update({ finbot_api_key: finbotApiKey.trim(), business_tax_status: taxStatus })
      .eq("id", photographer.id);
    setFinbotConnected(true);
    setFinbotApiKey("");
    setSavingInvoicing(false);
  };

  const saveTaxStatus = async (status: "exempt" | "licensed") => {
    setTaxStatus(status);
    if (!finbotConnected) return;
    setSavingInvoicing(true);
    await supabase.from("photographers").update({ business_tax_status: status }).eq("id", photographer.id);
    setSavingInvoicing(false);
  };

  const disconnectFinbot = async () => {
    setDisconnectingFinbot(true);
    await supabase.from("photographers").update({ finbot_api_key: null }).eq("id", photographer.id);
    setFinbotConnected(false);
    setDisconnectingFinbot(false);
  };

  const toggleLeadFollowUp = async () => {
    const next = !leadFollowUpEnabled;
    setSavingLeadFollowUp(true);
    await supabase.from("photographers").update({ lead_follow_up_enabled: next }).eq("id", photographer.id);
    setLeadFollowUpEnabled(next);
    setSavingLeadFollowUp(false);
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
        <div className="text-sm font-semibold tracking-wide mb-3.5">יומן Apple (iCloud)</div>
        {appleConnected ? (
          <div className="space-y-3">
            <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">
              מחובר ליומן &quot;{appleDisplayName}&quot; ✓
            </div>
            <button
              onClick={disconnectApple}
              disabled={appleDisconnecting}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-rose disabled:opacity-60"
            >
              {appleDisconnecting ? "מתנתק..." : "ניתוק היומן"}
            </button>
          </div>
        ) : appleCalendars ? (
          <div className="space-y-2">
            <p className="text-xs text-ink-soft mb-1">באיזה יומן ב-iCloud לשמור את האירועים?</p>
            {appleCalendars.map((cal) => (
              <button
                key={cal.url}
                onClick={() => selectAppleCalendar(cal)}
                disabled={appleSelecting}
                className="w-full text-right rounded-lg px-3.5 py-2.5 text-sm border border-line bg-white disabled:opacity-60"
              >
                {cal.displayName}
              </button>
            ))}
            {appleError && <p className="text-xs text-rose">{appleError}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg px-3 py-2.5 bg-white border border-line">
              <p className="text-xs text-ink-soft mb-2">
                נדרשת סיסמה ייעודית לאפליקציה (App-Specific Password) מ-Apple — לא הסיסמה הרגילה של Apple ID.
                לוקח כדקה ליצור, ויש מדריך מלא עם כל שלב בנפרד.
              </p>
              <button
                type="button"
                onClick={() => setShowAppleGuide(true)}
                className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-bg text-amber-deep"
              >
                מדריך מלא לחיבור יומן Apple ←
              </button>
            </div>
            <div>
              <label className="text-xs block mb-1 text-ink-soft">Apple ID (כתובת מייל)</label>
              <input
                type="email"
                value={appleEmail}
                onChange={(e) => setAppleEmail(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
              />
            </div>
            <div>
              <label className="text-xs block mb-1 text-ink-soft">App-Specific Password</label>
              <input
                type="password"
                value={applePassword}
                onChange={(e) => setApplePassword(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
              />
            </div>
            {appleError && <p className="text-xs text-rose">{appleError}</p>}
            <button
              onClick={discoverAppleCalendars}
              disabled={appleDiscovering || !appleEmail || !applePassword}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
            >
              {appleDiscovering ? "מתחבר..." : "גילוי יומנים"}
            </button>
          </div>
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

      <div className="rounded-2xl p-4 mt-5 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-1">חשבוניות ללקוחות</div>
        <p className="text-xs text-ink-soft mb-3.5">
          כדי להפיק ללקוחות שלך קבלות/חשבוניות אמיתיות (לא של המערכת אלא של העסק שלך), יש לחבר
          חשבון Finbot משלך. המסמך יוצא תחת הפרטים העסקיים שרשומים באותו חשבון.
        </p>
        {finbotConnected ? (
          <div className="space-y-3">
            <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">
              חשבון Finbot מחובר ✓
            </div>
            <div>
              <p className="text-xs mb-2 text-ink-soft">סטטוס עוסק (קובע אם מונפקת קבלה או חשבונית מס)</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => saveTaxStatus("exempt")}
                  disabled={savingInvoicing}
                  className="flex-1 rounded-full py-2 text-xs font-semibold disabled:opacity-60"
                  style={{
                    background: taxStatus === "exempt" ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: taxStatus === "exempt" ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  עוסק פטור
                </button>
                <button
                  onClick={() => saveTaxStatus("licensed")}
                  disabled={savingInvoicing}
                  className="flex-1 rounded-full py-2 text-xs font-semibold disabled:opacity-60"
                  style={{
                    background: taxStatus === "licensed" ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: taxStatus === "licensed" ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  עוסק מורשה
                </button>
              </div>
            </div>
            <button
              onClick={disconnectFinbot}
              disabled={disconnectingFinbot}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-rose disabled:opacity-60"
            >
              {disconnectingFinbot ? "מנתק..." : "ניתוק חשבון Finbot"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs mb-2 text-ink-soft">סטטוס עוסק</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setTaxStatus("exempt")}
                  className="flex-1 rounded-full py-2 text-xs font-semibold"
                  style={{
                    background: taxStatus === "exempt" ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: taxStatus === "exempt" ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  עוסק פטור
                </button>
                <button
                  onClick={() => setTaxStatus("licensed")}
                  className="flex-1 rounded-full py-2 text-xs font-semibold"
                  style={{
                    background: taxStatus === "licensed" ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: taxStatus === "licensed" ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  עוסק מורשה
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs block mb-1 text-ink-soft">מפתח API של Finbot</label>
              <input
                type="password"
                value={finbotApiKey}
                onChange={(e) => setFinbotApiKey(e.target.value)}
                placeholder="secret key"
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
              />
            </div>
            <button
              onClick={connectFinbot}
              disabled={savingInvoicing || !finbotApiKey.trim()}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
            >
              {savingInvoicing ? "מחבר..." : "חיבור חשבון"}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl p-4 mt-5 bg-card border border-line shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-wide">מעקב אוטומטי אחר לידים</div>
            <div className="text-xs text-ink-soft mt-0.5">
              כשליד לא הופך ללקוח/מתעניין שאבד, נשלחות אוטומטית עד 3 הודעות מעקב בוואטסאפ (אחרי יומיים, 5 ימים ו-10 ימים)
            </div>
          </div>
          <button
            onClick={toggleLeadFollowUp}
            disabled={savingLeadFollowUp}
            role="switch"
            aria-checked={leadFollowUpEnabled}
            aria-label="הפעלת מעקב אוטומטי אחר לידים"
            className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5 disabled:opacity-60"
            style={{
              background: leadFollowUpEnabled ? "var(--color-amber-deep)" : "var(--color-line)",
              justifyContent: leadFollowUpEnabled ? "flex-start" : "flex-end",
            }}
          >
            <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
          </button>
        </div>
      </div>

      {showAppleGuide && <AppleCalendarGuideModal onClose={() => setShowAppleGuide(false)} />}
    </div>
  );
}
