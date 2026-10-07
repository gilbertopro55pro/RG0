"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";

// "התראות לטלפון" (Web Push, owner 2026-10-01; lib/push.ts). Per device: turning it on asks the
// phone's permission and saves this device's subscription; the server then sends a new lead from
// the assistant and client approvals (quote, contract, album). iPhone only gets them from the app
// added to the home screen (iOS 16.4+, Apple's rule), so on an iPhone in Safari this explains how.

type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

async function currentStatus(): Promise<Status> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!PUBLIC_KEY;
  if (!supported) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export default function PushNotificationsSettings() {
  const t = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    currentStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) as BufferSource }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error("save");
      setStatus("on");
      setMessage(t("ההתראות הופעלו במכשיר הזה."));
    } catch {
      setMessage(t("לא הצלחנו להפעיל את ההתראות. נסו שוב."));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
      setMessage(data.error ?? (data.sent ? t("נשלחה התראת בדיקה. היא אמורה להופיע בעוד כמה שניות.") : t("לא נמצא מכשיר פעיל. כבו והפעילו מחדש.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t("התראות לטלפון")}</div>
          <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">{t("פנייה חדשה מהעוזר, ולקוח שאישר הצעת מחיר, חתם על חוזה או אישר עיצוב אלבום. ישר למרכז העדכונים של הטלפון.")}</div>
        </div>
        {(status === "on" || status === "off") && (
          <button
            type="button"
            onClick={status === "on" ? turnOff : turnOn}
            disabled={busy}
            role="switch"
            aria-checked={status === "on"}
            aria-label={t("הפעלת התראות לטלפון")}
            className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5 disabled:opacity-60"
            // On = green with the knob at the end (left in Hebrew, right in English), like the
            // intake assistant's switch (owner, 2026-10-07).
            style={{ background: status === "on" ? "var(--color-sage)" : "var(--color-line)", justifyContent: status === "on" ? "flex-end" : "flex-start" }}
          >
            <span className="h-5 w-5 rounded-full bg-white shadow" />
          </button>
        )}
      </div>

      {status === "on" && (
        <button type="button" onClick={test} disabled={busy} className="mt-3 h-9 px-3.5 rounded-xl border border-line bg-white text-xs font-semibold disabled:opacity-60">
          {t("שליחת התראת בדיקה")}
        </button>
      )}
      {status === "ios-install" && (
        <div className="mt-3 rounded-xl bg-chip p-3 text-xs leading-relaxed">
          <p className="font-semibold mb-1">{t("באייפון, התראות מגיעות רק מהאפליקציה שעל מסך הבית:")}</p>
          <ol className="list-decimal ps-4 space-y-0.5">
            <li>{t("בספארי, לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה).")}</li>
            <li>{t("בוחרים \"הוספה למסך הבית\".")}</li>
            <li>{t("פותחים את גילברטו מהאייקון החדש, וחוזרים לכאן כדי להפעיל.")}</li>
          </ol>
        </div>
      )}
      {status === "denied" && (
        <p className="mt-3 text-xs text-rose leading-relaxed">{t("ההתראות חסומות במכשיר הזה. כדי לאפשר: הגדרות הטלפון › התראות › גילברטו (או הגדרות האתר בדפדפן), ואז לחזור לכאן.")}</p>
      )}
      {status === "unsupported" && <p className="mt-3 text-xs text-ink-soft">{t("הדפדפן הזה לא תומך בהתראות. נסו מהטלפון, מ-Chrome או מהאפליקציה שעל מסך הבית.")}</p>}
      {message && <p className="mt-2 text-xs text-ink">{message}</p>}
    </div>
  );
}
