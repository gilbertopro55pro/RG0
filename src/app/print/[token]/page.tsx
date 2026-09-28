import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { loadPrintJob } from "@/lib/printHouseJob";
import { formatPrintDay } from "@/lib/printHouseLinks";

export const metadata: Metadata = { title: "קבצי הדפסה", robots: { index: false, follow: false } };

// The print house's download page, linked from the print-house email. Opening it records nothing:
// email security scanners open links on their own, so only the button (a POST to
// /api/print/<token>/download) counts as a download and notifies the photographer.
export default async function PrintFilesPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const { e } = await searchParams;
  const view = await loadPrintJob(createServiceRoleClient(), token);

  if (!view) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
        <p className="text-sm text-ink-soft">הקישור לא נמצא.</p>
      </div>
    );
  }

  const { job, albumTitle, galleryTitle, photographerName, blocked } = view;
  const pages = job.total_count;
  const from = photographerName ? `מאת ${photographerName}` : "";

  return (
    <div className="max-w-md mx-auto px-4 pt-10 pb-10 w-full">
      <h1 className="text-[22px] font-bold mb-1 font-display">קבצי הדפסה</h1>
      {from && <p className="text-xs mb-5 text-ink-soft">{from}</p>}

      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
        <div className="text-xs text-ink-soft mb-1">אלבום</div>
        <div className="text-sm font-semibold mb-3">{albumTitle}</div>
        {galleryTitle && (
          <>
            <div className="text-xs text-ink-soft mb-1">גלריה</div>
            <div className="text-sm mb-3">{galleryTitle}</div>
          </>
        )}
        <div className="text-xs text-ink-soft mb-1">קבצים</div>
        <div className="text-sm mb-3">
          {pages} עמודים, JPG ב-300 DPI (קובץ ZIP)
        </div>
        {job.send_notes?.trim() && (
          <>
            <div className="text-xs text-ink-soft mb-1">הנחיות והערות</div>
            <div className="text-sm whitespace-pre-line">{job.send_notes.trim()}</div>
          </>
        )}
      </div>

      {blocked === null ? (
        <>
          <form method="post" action={`/api/print/${token}/download`}>
            <button type="submit" className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white">
              הורדת הקבצים
            </button>
          </form>
          {job.link_expires_at && <p className="text-xs text-ink-soft mt-3 text-center">הקישור בתוקף עד {formatPrintDay(job.link_expires_at)}</p>}
          {e === "1" && <p className="text-xs mt-3 text-center text-rose">ההורדה לא הצליחה, נסו שוב.</p>}
        </>
      ) : (
        <div className="rounded-lg p-3 text-sm text-center bg-chip border border-line">
          {blocked === "preparing" && "הקבצים עדיין בהכנה. נסו שוב בעוד כמה דקות."}
          {blocked === "failed" && `הכנת הקבצים נכשלה. ${photographerName ? `פנו אל ${photographerName}` : "פנו אל הצלם"} לשליחה מחדש.`}
          {blocked === "expired" && `תוקף הקישור פג. ${photographerName ? `בקשו מ${photographerName}` : "בקשו מהצלם"} לחדש אותו.`}
        </div>
      )}
    </div>
  );
}
