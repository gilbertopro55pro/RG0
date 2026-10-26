"use client";

import { IconAlbum } from "@/components/icons/NavIcons";
import { useT } from "@/i18n/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { albumJobBusyMessage, startAlbumExport } from "@/lib/albumExports";
import { createClient } from "@/lib/supabase/client";
import PrintHouseEmailsSettings from "@/components/PrintHouseEmailsSettings";
import PrintHouseSendsHistory from "@/components/PrintHouseSendsHistory";
import type { PrintHouseEmailRow } from "@/lib/types";
import { useVivid } from "@/components/VividProvider";
import { VIVID_ICON_BOX, vividIconStyle } from "@/components/homeVividStyles";

type GalleryOption = { id: string; title: string; published: boolean; hasActiveAlbum: boolean };

type ExportFormat = "pdf" | "jpg" | "psd";

const FORMAT_LABEL: Record<ExportFormat, string> = { pdf: "PDF", jpg: "JPG", psd: "PSD" };

// Dashboard shortcut into the album design tool without going through a specific gallery's own
// page first — picks a gallery from a dropdown (published or still draft, both valid — an album
// can be designed before the client-facing gallery ever goes live). Two destinations from there:
// "המשך" always deep-links into GalleryManageView with ?openAlbum=1 (auto-opens the album panel);
// when the selected gallery already HAS an album (hasActiveAlbum), three export buttons ALSO
// appear so the whole album (every page) can be exported right from this dialog, per explicit
// request — no navigation into the album tool at all for the common "just get me the file" case.
// An export goes through the same store as the album tool's (lib/albumExports.ts): its progress
// window, "המשך ברקע" and the download card are AlbumExportsLayer's, so this dialog closes once the
// export starts. The print-house send too (since 2026-10-26), so it can go to the background and
// shows on the gallery's page.
export default function AlbumQuickAccessButton({ galleries }: { galleries: GalleryOption[] }) {
  const router = useRouter();
  const t = useT();
  const vivid = useVivid();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(galleries[0]?.id ?? "");
  const [navigating, setNavigating] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // "שליחה לבית דפוס" from here too (owner's request, 2026-09-28): same print-house emails and notes
  // as the album tool's own sheet (GalleryManageView), same send-to-print-house job.
  const [printHouseOpen, setPrintHouseOpen] = useState(false);
  const [printHouseEmails, setPrintHouseEmails] = useState<PrintHouseEmailRow[] | null>(null);
  const [printHouseSelectedId, setPrintHouseSelectedId] = useState<string | null>(null);
  const [printHouseNotes, setPrintHouseNotes] = useState("");

  const go = () => {
    if (!selectedId) return;
    setNavigating(true);
    router.push(`/galleries/${selectedId}?openAlbum=1`);
  };

  const quickExport = (format: ExportFormat) => {
    if (!selectedId) return;
    // Running inside the desktop app's embedded browser view (see photographer-flow-desktop's
    // BrowserView preload script, which sets this global) — hand off to the native editor's own
    // export instead of this web job queue. Desktop already has a fast local export engine with
    // real per-page progress (no server round-trip, no polling); routing a "quick export" click
    // through Vercel's job queue just because it happened to originate inside this embedded view
    // defeats the point of it being quick, and its generic percent-only progress UI (this
    // component has no per-page data to show) reads as stuck compared to the native one's.
    const bridge = (window as unknown as { desktopShellBridge?: { openNativeAlbumEditor: (galleryId: string, quickExportFormat?: ExportFormat) => void } })
      .desktopShellBridge;
    if (bridge) {
      bridge.openNativeAlbumEditor(selectedId, format);
      setOpen(false);
      return;
    }
    // to: 9999 rather than a real page count (not available to this lightweight component) — the
    // create route clamps it down to the album's actual last page itself, so this reliably means
    // "the whole album" regardless of how many pages it actually has.
    const gallery = galleries.find((g) => g.id === selectedId);
    startAlbumExport({ galleryId: selectedId, galleryTitle: gallery?.title ?? null, format, from: 1, to: 9999 });
    setExportError(null);
    setOpen(false);
  };

  const openPrintHouse = async () => {
    setExportError(null);
    if (!printHouseEmails) {
      const { data } = await createClient()
        .from("print_house_emails")
        .select("*")
        .order("created_at", { ascending: true })
        .returns<PrintHouseEmailRow[]>();
      const rows = data ?? [];
      setPrintHouseEmails(rows);
      setPrintHouseSelectedId((rows.find((r) => r.is_default) ?? rows[0])?.id ?? null);
    }
    setPrintHouseOpen(true);
  };

  // Through the exports store like an export (lib/albumExports.ts): the server emails the print
  // house once the JPGs are ready, and the window, pill and card are AlbumExportsLayer's.
  const sendToPrintHouse = () => {
    const target = printHouseEmails?.find((e) => e.id === printHouseSelectedId);
    if (!selectedId || !target) return;
    const busy = albumJobBusyMessage();
    if (busy) {
      setExportError(t(busy));
      return;
    }
    const gallery = galleries.find((g) => g.id === selectedId);
    // to: 9999 = the whole album (the route clamps it to the last page).
    startAlbumExport({
      galleryId: selectedId,
      galleryTitle: gallery?.title ?? null,
      format: "print",
      from: 1,
      to: 9999,
      print: { email: target.email, target: target.label || target.email, notes: printHouseNotes },
    });
    setExportError(null);
    setPrintHouseNotes("");
    setPrintHouseOpen(false);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-1 min-w-0 flex items-center justify-between gap-2 sm:gap-3 rounded-2xl p-3 sm:p-4 bg-card border border-line shadow-card text-start"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {vivid ? (
            // The vivid look (lib/tones.ts, admin only for now): the icon in a creative-tone square.
            <span className={VIVID_ICON_BOX} style={vividIconStyle("creative")}>
              <IconAlbum className="h-[18px] w-[18px]" />
            </span>
          ) : (
            <span className="flex w-6 shrink-0 items-center justify-center" style={{ color: "var(--color-brass)" }}>
              <IconAlbum className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-snug">{t("עיצוב אלבום")}</div>
            <div className="text-xs text-ink-soft leading-snug mt-0.5">{vivid ? t("פתיחה מגלריה") : t("גישה מהירה לפי גלריה")}</div>
          </div>
        </div>
        <span className="hidden sm:inline text-ink-soft shrink-0 ltr:rotate-180">←</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(28, 27, 25, 0.7)" }}
          onClick={() => !navigating && setOpen(false)}
        >
          <div className="w-full max-w-sm rounded-3xl bg-paper shadow-sheet p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-1">{t("עיצוב אלבום")}</h2>
            <p className="text-xs text-ink-soft mb-4">{t("באיזו גלריה תרצו לעבוד?")}</p>

            {galleries.length === 0 ? (
              <p className="text-sm text-ink-soft mb-4">{t("אין גלריות של אירועים שבחבילה שלהם יש שלב עיצוב אלבום.")}</p>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setExportError(null);
                }}
                className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-4"
              >
                {galleries.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                    {!g.published ? ` (${t("טיוטה")})` : ""}
                  </option>
                ))}
              </select>
            )}

            {galleries.find((g) => g.id === selectedId)?.hasActiveAlbum && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-ink-soft mb-2">{t("יש עיצוב אלבום פעיל בגלריה זו. אפשר לייצא ישירות:")}</p>
                <div className="flex items-center gap-2">
                  {(["pdf", "jpg", "psd"] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => quickExport(format)}
                      className="flex-1 h-10 rounded-xl border border-line bg-white text-xs font-semibold"
                    >
                      {t("ייצוא {format}", { format: FORMAT_LABEL[format] })}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => (printHouseOpen ? setPrintHouseOpen(false) : openPrintHouse())}
                  className="mt-2 w-full h-10 rounded-xl border border-line bg-white text-xs font-semibold"
                >
                  {t("שליחה לבית דפוס")}
                </button>
                {printHouseOpen && printHouseEmails && (
                  <div className="mt-3 rounded-xl border border-line bg-white p-3 max-h-[50vh] overflow-y-auto">
                    <p className="text-xs text-ink-soft mb-2">{t("קובצי ה-JPG של כל עמודי האלבום יישלחו כקישור להורדה, לכתובת שתבחרו.")}</p>
                    <PrintHouseEmailsSettings
                      initialEmails={printHouseEmails}
                      selectable
                      selectedId={printHouseSelectedId}
                      onSelect={setPrintHouseSelectedId}
                      onChange={setPrintHouseEmails}
                      compact
                    />
                    <label className="block mt-3">
                      <span className="text-xs font-semibold text-ink-soft">{t("הנחיות והערות לבית הדפוס (אופציונלי)")}</span>
                      <textarea
                        value={printHouseNotes}
                        onChange={(e) => setPrintHouseNotes(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder={t("למשל: נייר מט, כריכה קשה, 2 עותקים")}
                        className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={sendToPrintHouse}
                      disabled={!printHouseSelectedId}
                      className="mt-3 w-full h-10 rounded-xl bg-ink text-white text-sm font-semibold disabled:opacity-40"
                    >
                      {(() => {
                        const target = printHouseEmails.find((e) => e.id === printHouseSelectedId);
                        return target ? t("שליחה ל-{to}", { to: target.label || target.email }) : t("בחרו כתובת לשליחה");
                      })()}
                    </button>
                    {selectedId && <PrintHouseSendsHistory galleryId={selectedId} />}
                  </div>
                )}
                {exportError && <p className="text-xs text-rose mt-2">{exportError}</p>}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={navigating}
                className="flex-1 h-11 rounded-xl border border-line text-sm font-semibold disabled:opacity-50"
              >
                {t("ביטול")}
              </button>
              <button
                type="button"
                onClick={go}
                disabled={!selectedId || navigating}
                className="flex-1 h-11 rounded-xl bg-ink text-white text-sm font-semibold disabled:opacity-50"
              >
                {navigating ? t("טוען...") : t("כניסה לכלי העיצוב")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
