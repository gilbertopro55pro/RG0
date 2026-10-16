"use client";

import { useT } from "@/i18n/client";
import { remoteDeviceText, type RemoteUpload } from "@/lib/remoteUploads";

// An upload running on another device or tab (lib/remoteUploads.ts), on the galleries list and the
// gallery page. Says where it runs, how far it got, and when it stopped moving (the computer slept,
// the tab was closed), which the device running it can't tell anyone once it's asleep.
export default function RemoteUploadLine({ upload, onRefresh }: { upload: RemoteUpload; onRefresh?: () => void }) {
  const t = useT();
  const device = t(remoteDeviceText(upload));
  const videos = upload.kind === "videos";
  const running = upload.status === "uploading";
  const counted = upload.total != null;
  const text = running
    ? counted
      ? t("מעלה {device}: {done} מתוך {total}", { device, done: upload.done, total: upload.total! })
      : videos
        ? t("מעלה {device}: {n} סרטונים עד עכשיו", { device, n: upload.succeeded })
        : t("מעלה {device}: {n} תמונות עד עכשיו", { device, n: upload.succeeded })
    : upload.status === "stalled"
      ? t("ההעלאה {device} נעצרה ב-{done} מתוך {total}. כדאי לבדוק שהמכשיר ער והחלון פתוח.", { device, done: upload.done, total: upload.total ?? upload.done })
      : upload.status === "offline"
        ? t("ההעלאה {device} נעצרה, אין שם חיבור לאינטרנט", { device })
        : upload.status === "cancelled"
          ? t("ההעלאה {device} בוטלה", { device })
          : videos
            ? t("הועלו {n} סרטונים {device}", { device, n: upload.succeeded })
            : t("הועלו {n} תמונות {device}", { device, n: upload.succeeded });
  const good = upload.status === "done";
  const bad = upload.status === "stalled" || upload.status === "offline" || upload.status === "cancelled";
  return (
    <div className="mt-1.5" aria-live="polite">
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${good ? "text-sage" : bad ? "text-rose" : "text-ink"}`}>
        {running && <span className="h-3 w-3 shrink-0 rounded-full border-2 border-line border-t-ink animate-spin" aria-hidden="true" />}
        <span className="min-w-0">{text}</span>
        {running && counted && upload.pct != null && <span className="ms-auto shrink-0 font-data text-ink-soft">{Math.round(upload.pct)}%</span>}
        {onRefresh && upload.succeeded > 0 && (
          <button onClick={onRefresh} className="ms-auto shrink-0 underline underline-offset-2 text-ink">
            {t("רענון")}
          </button>
        )}
      </div>
      {running && counted && (
        <div className="mt-1 h-1 rounded-full bg-line overflow-hidden">
          <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${upload.pct ?? (upload.total ? (upload.done / upload.total) * 100 : 0)}%` }} />
        </div>
      )}
    </div>
  );
}
