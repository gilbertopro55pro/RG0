"use client";

import { useEffect, useState } from "react";
import { BTN_PRESS } from "@/lib/viewTransition";
import CameraSetupGuide from "@/components/CameraSetupGuide";

// Set once the FTP server is actually deployed (see photographer-flow-ftp) — either its Fly.io
// app hostname directly (e.g. gilberto-ftp.fly.dev) or a custom "ftp.myframeflow.com" DNS record
// pointed at it. NEXT_PUBLIC_ since this renders in a client component.
const FTP_HOST = process.env.NEXT_PUBLIC_FTP_SERVER_HOST || "(עדיין לא הוגדר)";

// "FTP Live" — a photographer points their camera's built-in FTP/FTPS client (or tethering
// software) at these per-gallery credentials during an event, and shots land in this exact
// gallery within seconds. The credentials live on `galleries` (see migration 0083); the actual
// FTP listener is a separate always-on service (photographer-flow-ftp, deployed on Fly.io — this
// app itself is serverless and can't hold a persistent FTP socket open).
// `allowed` gates this to פרו+ (studio_pro) photographers, plus the admin account regardless
// of its own plan — the UI-level gate here is a courtesy (an honest upsell instead of a dead
// end); the actual enforcement is server-side, in the ftp-credentials route itself, since a
// client-side-only gate is never a real security boundary.
export default function GalleryFtpSection({ galleryId, allowed }: { galleryId: string; allowed: boolean }) {
  const [creds, setCreds] = useState<{ username: string; password: string } | null | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    fetch(`/api/galleries/${galleryId}/ftp-credentials`)
      .then((res) => res.json())
      .then((data) => setCreds(data.username ? { username: data.username, password: data.password } : null));
  }, [galleryId, allowed]);

  const generate = async () => {
    setGenerating(true);
    const res = await fetch(`/api/galleries/${galleryId}/ftp-credentials`, { method: "POST" });
    const data = await res.json();
    setGenerating(false);
    if (res.ok) {
      setCreds(data);
      setRevealed(true);
    }
  };

  const copy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!allowed) {
    return (
      <div className="mt-5 rounded-2xl p-4 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold mb-1">FTP Live: העלאה חיה מהמצלמה</div>
        <p className="text-xs text-ink-soft">
          חיברו את המצלמה ישירות לגלריה בזמן האירוע, זמין במסלול פרו+.
        </p>
        <a href="/settings?tab=account" className="inline-block mt-3 text-xs font-semibold text-amber-deep underline">
          שדרוג לפרו+
        </a>
      </div>
    );
  }

  if (creds === undefined) return null;

  return (
    <div className="mt-5 rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold mb-1">FTP Live: העלאה חיה מהמצלמה</div>
      <p className="text-xs mb-3.5 text-ink-soft">
        חיברו את המצלמה (או תוכנת שידור) עם הפרטים האלה, וכל תמונה שתצולם תופיע בגלריה הזו תוך שניות. בלי לגעת
        במחשב באמצע האירוע.
      </p>

      {!creds ? (
        <button
          onClick={generate}
          disabled={generating}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60 ${BTN_PRESS}`}
        >
          {generating ? "יוצר..." : "יצירת פרטי חיבור"}
        </button>
      ) : (
        <div className="space-y-2">
          <FtpField label="כתובת שרת (Host)" value={FTP_HOST} onCopy={() => copy("host", FTP_HOST)} copied={copied === "host"} />
          <FtpField label="שם משתמש" value={creds.username} onCopy={() => copy("user", creds.username)} copied={copied === "user"} dir="ltr" />
          <FtpField
            label="סיסמה"
            value={revealed ? creds.password : "••••••••••••"}
            onCopy={() => copy("pass", creds.password)}
            copied={copied === "pass"}
            dir="ltr"
            action={
              <button onClick={() => setRevealed((v) => !v)} className="text-xs font-semibold text-ink-soft shrink-0">
                {revealed ? "הסתרה" : "הצגה"}
              </button>
            }
          />
          <div className="flex items-center justify-between mt-1">
            <button onClick={() => setGuideOpen(true)} className={`text-xs font-semibold text-ink-soft underline ${BTN_PRESS}`}>
              מדריך חיבור לפי דגם המצלמה
            </button>
            <button onClick={generate} disabled={generating} className="text-xs font-semibold text-rose disabled:opacity-60">
              {generating ? "יוצר..." : "יצירת פרטים חדשים"}
            </button>
          </div>
        </div>
      )}

      {guideOpen && creds && (
        <CameraSetupGuide host={FTP_HOST} username={creds.username} password={creds.password} onClose={() => setGuideOpen(false)} />
      )}
    </div>
  );
}

function FtpField({
  label,
  value,
  onCopy,
  copied,
  dir,
  action,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  dir?: "ltr" | "rtl";
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-chip">
      <div className="min-w-0">
        <div className="text-[10px] text-ink-soft">{label}</div>
        <div className="text-sm font-mono truncate" dir={dir}>
          {value}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        <button onClick={onCopy} className={`text-xs font-semibold text-ink-soft ${BTN_PRESS}`}>
          {copied ? "הועתק ✓" : "העתקה"}
        </button>
      </div>
    </div>
  );
}
