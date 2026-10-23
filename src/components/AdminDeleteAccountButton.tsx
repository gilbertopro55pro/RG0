"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BodyPortal from "@/components/BodyPortal";
import { useModalEntered } from "@/lib/useModalEntered";
import type { AdminAccountPreview, AdminDeletionBlocker } from "@/lib/accountDeletion";
import { useT } from "@/i18n/client";

// Admin dashboard › "מחיקת חשבון" (owner's request, 2026-10-23). Opens a dialog with what the
// account holds; an account that may not be deleted (paid, recurring, QA, admin) says why, and any
// other is deleted only after its email is typed back. The server checks all of it again.

const BLOCKER_TEXT: Record<AdminDeletionBlocker, string> = {
  admin: "זה חשבון המנהל, ואותו אי אפשר למחוק.",
  keep_account: "זה חשבון בדיקה ששמור במערכת (keep_account), ולכן לא נמחק.",
  recurring: "יש לחשבון הוראת קבע פעילה ב-PayPlus. קודם מבטלים אותה, ורק אז מוחקים.",
  paid: "החשבון שילם בעבר. חשבון ששילם לא נמחק מכאן, כדי לשמור את רשומות התשלום.",
};

export default function AdminDeleteAccountButton({ id, name, compact = false }: { id: string; name: string; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-rose font-semibold rounded-lg border border-line bg-white shrink-0 ${compact ? "text-xs h-8 px-2.5" : "text-[13px] h-9 px-3"}`}
      >
        {t("מחיקת חשבון")}
      </button>
      {open && <DeleteDialog id={id} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

function DeleteDialog({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const entered = useModalEntered();
  const [account, setAccount] = useState<AdminAccountPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/accounts/${id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) setAccount(data.account);
        else setLoadError(data.error ?? t("לא הצלחנו לטעון את החשבון"));
      })
      .catch(() => alive && setLoadError(t("לא הצלחנו לטעון את החשבון")));
    return () => {
      alive = false;
    };
  }, [id, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const matches = !!account && typed.trim().toLowerCase() === account.email.trim().toLowerCase();

  async function remove() {
    if (!account || !matches) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/accounts/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDeleted(true);
        router.refresh();
      } else if (data.blocker) {
        setAccount({ ...account, blocker: data.blocker });
      } else {
        setError(data.error ?? t("המחיקה נכשלה"));
      }
    } catch {
      setError(t("המחיקה נכשלה, נסו שוב"));
    } finally {
      setBusy(false);
    }
  }

  const counts = account?.counts;
  const rows: [string, number][] = counts
    ? [
        [t("אירועים"), counts.events],
        [t("גלריות"), counts.galleries],
        [t("תמונות"), counts.photos],
        [t("לידים"), counts.leads],
        [t("מסגרות מגנט"), counts.magnetFrames],
        [t("חברי צוות"), counts.teamMembers],
      ]
    : [];

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
        style={{
          background: "rgba(28, 27, 25, 0.45)",
          backdropFilter: entered ? "blur(12px)" : "blur(0px)",
          WebkitBackdropFilter: entered ? "blur(12px)" : "blur(0px)",
          transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
        }}
        onClick={() => !busy && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("מחיקת חשבון")}
          className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-paper shadow-sheet p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold font-display">{t("מחיקת החשבון של {name}", { name })}</h2>
            <button type="button" onClick={onClose} disabled={busy} aria-label={t("סגירה")} className="text-ink-soft text-xl leading-none px-1 disabled:opacity-50">
              ×
            </button>
          </div>

          {deleted ? (
            <>
              <p className="text-sm mb-4">{t("החשבון והקבצים שלו נמחקו.")}</p>
              <button type="button" onClick={onClose} className="w-full h-11 rounded-xl bg-ink text-white font-bold text-sm">
                {t("סגירה")}
              </button>
            </>
          ) : loadError ? (
            <p className="text-sm text-rose">{loadError}</p>
          ) : !account ? (
            <p className="text-sm text-ink-soft py-6 text-center">{t("טוען...")}</p>
          ) : (
            <>
              <div className="text-xs text-ink-soft break-all mb-3">{account.email}</div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {rows.map(([label, n]) => (
                  <div key={label} className="rounded-xl bg-chip px-2.5 py-2 text-center">
                    <div className="text-base font-bold font-data">{n.toLocaleString()}</div>
                    <div className="text-[11px] text-ink-soft">{label}</div>
                  </div>
                ))}
              </div>

              {account.blocker ? (
                <p className="text-sm rounded-xl px-3 py-2.5 bg-chip">{t(BLOCKER_TEXT[account.blocker])}</p>
              ) : (
                <>
                  <p className="text-sm mb-3">
                    {t("המחיקה סופית: החשבון, כל הנתונים שלו וכל הקבצים באחסון נמחקים, ואין דרך לשחזר. גם חברי הצוות שלו לא יוכלו להתחבר.")}
                  </p>
                  <label className="block text-xs text-ink-soft mb-1" htmlFor="admin-delete-confirm">
                    {t("לאישור, הקלידו את האימייל של החשבון")}
                  </label>
                  <input
                    id="admin-delete-confirm"
                    type="email"
                    dir="ltr"
                    autoComplete="off"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={account.email}
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-3"
                  />
                  {error && <p className="text-xs text-rose mb-2">{error}</p>}
                  <button
                    type="button"
                    onClick={remove}
                    disabled={!matches || busy}
                    className="w-full h-11 rounded-xl font-bold text-sm text-white disabled:opacity-40"
                    style={{ background: "var(--color-rose)" }}
                  >
                    {busy ? t("מוחק...") : t("מחיקת החשבון לצמיתות")}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </BodyPortal>
  );
}
