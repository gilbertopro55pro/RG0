"use client";

import { useCallback, useEffect, useState } from "react";
import { useT, useLang } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";

type Overview = {
  id: string;
  connectedId: string | null;
  status: {
    display_phone_number?: string;
    verified_name?: string;
    name_status?: string;
    status?: string;
    code_verification_status?: string;
    platform_type?: string;
    quality_rating?: string;
    error?: { message?: string };
  };
  diagnosis: string[];
  waba: { id: string; appSubscribed: boolean } | null;
  token: { type?: string; valid?: boolean; expiresAt?: number | null; scopes?: string[]; error?: string };
  appNumber: { display: string | null; status: string | null; error: string | null } | null;
};

// The bot's dedicated number, bought 2026-09-25 (+972 55-253-6596).
const SUGGESTED_ID = "1268190219710434";

// Settings → אוטומציה, admin only: the intake assistant on WhatsApp (phase 2, lib/whatsappIntake.ts).
// Shows the bot number's Cloud API status with a plain reading of what blocks it, registers it
// with its PIN (typed here, never stored), and connects it to the bot.
export default function WhatsAppBotAdmin({ connectedId }: { connectedId: string | null }) {
  const t = useT();
  const lang = useLang();
  const [id, setId] = useState(connectedId ?? SUGGESTED_ID);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (numberId: string) => {
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/whatsapp/bot-number?id=${encodeURIComponent(numberId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setData(null);
      setMessage(json.error ?? t("הבדיקה נכשלה"));
      return;
    }
    setData(json);
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => load(connectedId ?? SUGGESTED_ID), 0);
    return () => clearTimeout(timer);
  }, [load, connectedId]);

  const act = async (body: Record<string, string>, done: string) => {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/whatsapp/bot-number", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok || json.ok === false) {
      setMessage(json.error ?? t("הפעולה נכשלה"));
      return;
    }
    setPin("");
    setMessage(done);
    await load(id);
  };

  const s = data?.status;
  const connected = data?.connectedId === id;
  const field = "rounded-lg px-3 py-2 text-sm border border-line font-data";
  const button = "text-xs font-semibold rounded-lg px-3 py-2 border border-line shrink-0 disabled:opacity-50";

  return (
    <div className="rounded-2xl bg-card border border-line overflow-hidden mt-5">
      <div className="p-4">
        <div className="text-sm font-semibold mb-1">{t("העוזר בוואטסאפ")}</div>
        <p className="text-xs text-ink-soft">
          {t("זמין כרגע רק בחשבון האדמין, עד להשלמת הליטוש. העוזר עונה רק לשיחה חדשה שנפתחת מהמודעה (\"שלום! אפשר לקבל מידע נוסף על זה?\"), תמיד בעברית, לא למספרים שכבר מוכרים במערכת, ולא בשיחה שענית בה בעצמך.")}
        </p>
      </div>

      <div className="px-4 py-3 border-t border-line">
        <div className="text-xs text-ink-soft mb-1.5">{t("מזהה המספר (Phone number ID)")}</div>
        <div className="flex items-center gap-2">
          <input value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} dir="ltr" className={`${field} flex-1 min-w-0`} />
          <button type="button" disabled={loading || !id} onClick={() => load(id)} className={button} style={{ background: "var(--color-input-bg)" }}>
            {loading ? t("בודק...") : t("בדיקה")}
          </button>
        </div>
      </div>

      {data && (
        <div className="px-4 py-3 border-t border-line text-sm space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-ink-soft">{t("מספר")}</span>
            <span className="font-data" dir="ltr">{s?.display_phone_number ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-ink-soft">{t("שם תצוגה")}</span>
            <span>{s?.verified_name ?? "—"} {s?.name_status ? <span className="font-data text-xs text-ink-soft">({s.name_status})</span> : null}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-ink-soft">{t("סטטוס")}</span>
            <span className="font-data">{s?.status ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-ink-soft">{t("אימות קוד")}</span>
            <span className="font-data">{s?.code_verification_status ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-ink-soft">{t("פלטפורמה")}</span>
            <span className="font-data">{s?.platform_type ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-ink-soft">{t("אסימון")}</span>
            <span className="font-data text-xs">
              {data.token.error
                ? data.token.error
                : `${data.token.type ?? "?"}, ${data.token.valid ? t("תקף") : t("לא תקף")}${data.token.expiresAt ? t(", עד {date}", { date: new Date(data.token.expiresAt * 1000).toLocaleDateString(dateLocale(lang)) }) : t(", ללא תפוגה")}`}
            </span>
          </div>
          {data.appNumber && (
            <div className="flex justify-between gap-2">
              <span className="text-ink-soft">{t("המספר שהמערכת שולחת ממנו")}</span>
              <span className="font-data text-xs" dir="ltr">{data.appNumber.display ?? data.appNumber.error} {data.appNumber.status ?? ""}</span>
            </div>
          )}
          {data.diagnosis.length > 0 && (
            <ul className="mt-2 text-xs text-ink-soft list-disc ps-4 space-y-1">
              {data.diagnosis.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {data && s?.status === "PENDING" && s.code_verification_status === "VERIFIED" && (
        <div className="px-4 py-3 border-t border-line">
          <div className="text-xs text-ink-soft mb-1.5">
            {t("רישום ל-Cloud API. קוד PIN בן 6 ספרות: אם כבר הגדרת אימות דו-שלבי למספר, זה הקוד הזה. אם לא, הקוד שתבחר כאן יהפוך לקוד האימות הדו-שלבי של המספר. הקוד לא נשמר במערכת.")}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              placeholder="000000"
              className={`${field} w-28`}
            />
            <button type="button" disabled={loading || pin.length !== 6} onClick={() => act({ action: "register", pin }, t("המספר נרשם"))} className={button} style={{ background: "var(--color-input-bg)" }}>
              {t("רישום המספר")}
            </button>
          </div>
        </div>
      )}

      {data?.waba && !data.waba.appSubscribed && (
        <div className="px-4 py-3 border-t border-line flex items-center justify-between gap-2">
          <span className="text-xs text-ink-soft">{t("הודעות נכנסות מהמספר לא יגיעו עד שהאפליקציה תירשם ל-webhooks של החשבון.")}</span>
          <button type="button" disabled={loading} onClick={() => act({ action: "subscribe", wabaId: data.waba!.id }, t("האפליקציה נרשמה ל-webhooks"))} className={button} style={{ background: "var(--color-input-bg)" }}>
            {t("חיבור webhooks")}
          </button>
        </div>
      )}

      {data && (
        <div className="px-4 py-3 border-t border-line flex items-center justify-between gap-2">
          <span className="text-xs text-ink-soft">
            {connected
              ? t("העוזר מחובר למספר הזה. הוא עונה רק כשהעוזר מופעל (המתג למעלה).")
              : data.connectedId
                ? t("העוזר מחובר כרגע למספר אחר ({id}).", { id: data.connectedId })
                : t("העוזר לא מחובר לאף מספר.")}
          </span>
          {connected ? (
            <button type="button" disabled={loading} onClick={() => act({ action: "disconnect" }, t("העוזר נותק מהמספר"))} className={button}>
              {t("ניתוק")}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading || s?.status !== "CONNECTED"}
              onClick={() => act({ action: "connect" }, t("העוזר מחובר למספר"))}
              className={button}
              style={{ background: "var(--color-input-bg)" }}
            >
              {t("חיבור העוזר")}
            </button>
          )}
        </div>
      )}

      {message && <div className="px-4 py-2 border-t border-line text-xs">{message}</div>}
    </div>
  );
}
