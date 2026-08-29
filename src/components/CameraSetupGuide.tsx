"use client";

import { useState } from "react";
import { BTN_PRESS } from "@/lib/viewTransition";
import { CAMERA_BRANDS, CAMERA_GUIDES, fillGuideStep, type CameraBrand } from "@/lib/cameraFtpGuides";

export default function CameraSetupGuide({
  host,
  username,
  password,
  onClose,
}: {
  host: string;
  username: string;
  password: string;
  onClose: () => void;
}) {
  const [brand, setBrand] = useState<CameraBrand | null>(null);

  const guide = brand ? CAMERA_GUIDES[brand] : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {!brand ? (
          <>
            <h2 className="text-base font-bold mb-1 font-display">איזו מצלמה יש לכם?</h2>
            <p className="text-xs text-ink-soft mb-4">נציג מדריך שלב-אחר-שלב עם הפרטים שלכם כבר ממולאים</p>
            <div className="grid grid-cols-2 gap-2">
              {CAMERA_BRANDS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBrand(b.id)}
                  className={`rounded-xl py-3.5 text-sm font-semibold bg-white border border-line ${BTN_PRESS}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="w-full text-center mt-4 text-xs text-ink-soft">
              סגירה
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setBrand(null)} className="text-xs font-semibold text-ink-soft mb-2">
              ← בחירת מותג אחר
            </button>
            <h2 className="text-base font-bold mb-1 font-display">
              חיבור מצלמת {CAMERA_BRANDS.find((b) => b.id === brand)?.label}
            </h2>
            <p className="text-xs text-ink-soft mb-3">{guide!.models}</p>
            {guide!.note && (
              <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-amber-bg text-amber-deep">{guide!.note}</p>
            )}
            <ol className="space-y-2.5">
              {guide!.steps.map((step, i) => {
                const filled = fillGuideStep(step, { host, username, password });
                return (
                  <li key={i} className="flex gap-2.5">
                    <span className="shrink-0 h-5 w-5 rounded-full bg-chip text-[11px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div className="text-sm">
                      <div>{filled.title}</div>
                      {filled.detail && (
                        <div className="text-xs font-data mt-0.5 text-amber-deep" dir="ltr">
                          {filled.detail}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <button onClick={onClose} className={`w-full text-center rounded-lg py-3 mt-5 text-sm font-semibold bg-ink text-white ${BTN_PRESS}`}>
              סגירה
            </button>
          </>
        )}
      </div>
    </div>
  );
}
