"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { Lang } from "@/i18n/config";
import ClientMessageSheet from "@/components/ClientMessageSheet";
import { stageKeyBody } from "@/lib/heroStageAction";

// The stage button on the next-shoot card (owner, 2026-10-22, admin only with the vivid look):
// marks the current stage done through the same route as the event page, then the card moves on
// to the next stage. A stage that sends the client an update opens the client message window with
// the photographer's own template (built on the server, page.tsx), and "↺ ביטול סימון" stays for a
// few seconds. Both live in HeroStageToasts, outside the card, from a module store: after the
// refresh the card may show another event or none (marking the shoot day moves it to the next
// shoot), which would unmount anything inside it. Everything they act on is captured at the tap.

export type HeroStageButtonData = {
  key: string;
  label: string;
  // The client update for this stage, when marking it sends one and the client has a phone.
  message: string | null;
  phone: string | null;
  email: string | null;
  lang: Lang;
};

const FOIL_RING = "color-mix(in srgb, var(--vivid-foil) 55%, transparent)";
const UNDO_MS = 10_000;

type Done = { eventId: string; clientName: string; key: string; label: string };
type Sheet = Done & { text: string; phone: string; email: string | null; lang: Lang };
type State = { undo: Done | null; sheet: Sheet | null };

let state: State = { undo: null, sheet: null };
const listeners = new Set<() => void>();
const setState = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getState = () => state;
const serverState: State = { undo: null, sheet: null };

async function patchStage(target: Done, done: boolean, fallback: string, t: (k: string) => string) {
  const res = await fetch(`/api/events/${target.eventId}/stages`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...stageKeyBody(target.key), done }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; notify?: unknown };
  if (!res.ok) throw new Error(data.error ? t(data.error) : fallback);
  return data;
}

export default function NextStageButton({
  eventId,
  clientName,
  action,
  children,
}: {
  eventId: string;
  clientName: string;
  action: HeroStageButtonData;
  children?: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mark = async () => {
    if (busy) return;
    const target: Done = { eventId, clientName, key: action.key, label: action.label };
    setBusy(true);
    setError(null);
    try {
      const data = await patchStage(target, true, t("שגיאה בעדכון השלב"), t);
      const sheet = data.notify && action.message && action.phone ? { ...target, text: action.message, phone: action.phone, email: action.email, lang: action.lang } : null;
      setState({ undo: target, sheet });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("שגיאה בעדכון השלב"));
    } finally {
      setBusy(false);
    }
  };

  const button = "flex-1 min-w-0 h-11 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold";
  const outline = { border: `1px solid ${FOIL_RING}`, color: "var(--vivid-foil-text)", background: "color-mix(in srgb, var(--vivid-foil) 10%, transparent)" };

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button type="button" onClick={mark} disabled={busy} className={`${button} disabled:opacity-60`} style={outline}>
          <span aria-hidden="true">✓</span>
          {t("סימון כבוצע")}
        </button>
        {children}
      </div>
      {error && (
        <p className="mt-2 text-[13px]" role="alert" style={{ color: "color-mix(in srgb, var(--tone-attention) 42%, #ffffff)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// The undo notice and the client message window, rendered by the home page beside the card.
export function HeroStageToasts() {
  const t = useT();
  const router = useRouter();
  const { undo, sheet } = useSyncExternalStore(subscribe, getState, () => serverState);
  const [busy, setBusy] = useState(false);
  // A failed undo, shown in place of its notice (only while that notice is up).
  const [failed, setFailed] = useState<{ undo: Done; message: string } | null>(null);
  const error = failed && failed.undo === undo ? failed.message : null;

  useEffect(() => {
    if (!undo || sheet) return;
    const timer = setTimeout(() => setState({ undo: null }), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo, sheet]);

  const unmark = async () => {
    if (!undo || busy) return;
    const target = undo;
    setBusy(true);
    setFailed(null);
    try {
      await patchStage(target, false, t("שגיאה בעדכון השלב"), t);
      setState({ undo: null });
      router.refresh();
    } catch (e) {
      setFailed({ undo: target, message: e instanceof Error ? e.message : t("שגיאה בעדכון השלב") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {undo && !sheet && (
        <div className="fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none" style={{ bottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}>
          <div className="pointer-events-auto flex items-center gap-3 max-w-full rounded-full ps-4 pe-2 py-1.5 bg-ink text-white shadow-sheet text-sm" role="status">
            <span className="min-w-0 truncate">
              {error ?? t("סומן כבוצע: {stage} · {client}", { stage: t(undo.label), client: undo.clientName })}
            </span>
            <button
              type="button"
              onClick={unmark}
              disabled={busy}
              className="shrink-0 h-8 px-3 rounded-full font-semibold disabled:opacity-60"
              style={{ color: "var(--vivid-foil)", background: "rgba(255,255,255,0.08)" }}
            >
              {t("↺ ביטול סימון")}
            </button>
          </div>
        </div>
      )}
      {sheet && (
        <ClientMessageSheet
          title={t("שליחת עדכון ללקוח")}
          intro={t("השלב \"{stage}\" סומן כבוצע. אפשר לערוך את ההודעה לפני השליחה.", { stage: t(sheet.label) })}
          initialText={sheet.text}
          lang={sheet.lang}
          phone={sheet.phone}
          email={sheet.email}
          subject={t(sheet.label)}
          onSend={() => {
            // The activity log and the 3-day client reminders, as the event page's send does.
            void fetch(`/api/events/${sheet.eventId}/notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ label: sheet.label, clientPhone: sheet.phone, stageKey: sheet.key }),
              keepalive: true,
            }).catch(() => {});
          }}
          // The undo notice shows once the window closes, for its own few seconds.
          onClose={() => setState({ sheet: null })}
        />
      )}
    </>
  );
}
