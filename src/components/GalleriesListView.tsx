"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import NewGalleryModal from "@/components/NewGalleryModal";
import PageGuide from "@/components/PageGuide";
import GalleryQuickActionsMenu from "@/components/GalleryQuickActionsMenu";
import { readAlbumRotateResume } from "@/lib/albumRotateResume";
import BackLink from "@/components/BackLink";
import ViewToggle from "@/components/ViewToggle";
import { getUploadsSnapshot, subscribeUploads, useGalleryUploads, type GalleryUpload } from "@/lib/galleryUploads";
import { useRemoteUploads } from "@/lib/remoteUploads";
import RemoteUploadLine from "@/components/RemoteUploadLine";
import ToneTag from "@/components/ToneTag";
import { useVivid } from "@/components/VividProvider";
import { useT, useLang } from "@/i18n/client";
import { dateLocale, type Lang } from "@/i18n/config";
import { shortClientUrl } from "@/lib/shortLinks";
import { galleriesViewCookie, type GalleriesView } from "@/lib/galleriesView";

export type GalleryListItem = {
  id: string;
  title: string;
  clientName: string;
  eventDate: string | null;
  photoCount: number;
  published: boolean;
  archived: boolean;
  expiresAt: string | null;
  permanentDeleteAt: string | null;
  archiveReason: "expired" | "manual" | null;
  coverUrl: string | null;
  // The cover's preview blur and shape, for showing it whole over a blurred copy of itself.
  coverBlur?: string | null;
  coverAspect?: number | null;
  accessToken: string;
  expiryDays: 7 | 14 | 30 | 90 | 180 | 365 | null;
  restoredOnce: boolean;
  // The client's language for the share message (UI languages phase 3); server-computed.
  clientLang?: Lang;
};

type SortKey = "event_date" | "name" | "expires";

// A double-click on a row needs the single click's navigation delayed just long enough to know a
// second click isn't coming — with no delay at all, the first click of any double-click has
// already navigated away before the browser's dblclick event even fires.
const DOUBLE_CLICK_WINDOW_MS = 250;

export default function GalleriesListView({
  items,
  initialView,
  photographerName,
  photographerEmail,
}: {
  items: GalleryListItem[];
  initialView: GalleriesView;
  photographerName: string;
  photographerEmail: string;
}) {
  const t = useT();
  const lang = useLang();
  const vivid = useVivid();
  const router = useRouter();
  // See src/lib/albumRotateResume.ts — a standalone-iOS-PWA-only workaround for the album tool
  // mistapping after rotation. This page is just the bounce point of that round trip: land here,
  // immediately push straight back to the gallery that's waiting to reopen its tool, and never show
  // the actual galleries grid in between (a real spinner-covered flash of unrelated content would
  // undercut the "one continuous load" illusion this whole workaround exists to create).
  const [resuming, setResuming] = useState(() => !!readAlbumRotateResume());
  useEffect(() => {
    const intent = readAlbumRotateResume();
    if (!intent) return;
    setResuming(true);
    router.replace(`/galleries/${intent.galleryId}`);
  }, [router]);

  // Photo and video uploads running in the background (lib/galleryUploads.ts): each gallery's row
  // shows its own progress (the photos when both run), and when one finishes the photo counts are
  // read from the server again.
  const uploads = useGalleryUploads();
  const uploadByGallery = useMemo(() => {
    const byGallery = new Map<string, GalleryUpload>();
    for (const u of uploads) {
      if (u.kind === "photos" || (u.kind === "videos" && !byGallery.has(u.targetId))) byGallery.set(u.targetId, u);
    }
    return byGallery;
  }, [uploads]);
  // Uploads running on another device or tab (owner, 2026-10-16: the computer's upload didn't show
  // on the phone): the newest one per gallery, when this tab isn't uploading there itself.
  const remoteUploads = useRemoteUploads();
  const remoteByGallery = useMemo(() => {
    const byGallery = new Map<string, (typeof remoteUploads)[number]>();
    for (const r of remoteUploads) if (!byGallery.has(r.galleryId)) byGallery.set(r.galleryId, r);
    return byGallery;
  }, [remoteUploads]);
  useEffect(() => {
    const activeIds = () => new Set(getUploadsSnapshot().filter((u) => u.phase === "queued" || u.phase === "uploading").map((u) => u.key));
    let before = activeIds();
    return subscribeUploads(() => {
      const now = activeIds();
      const finished = [...before].some((id) => !now.has(id));
      before = now;
      if (finished) router.refresh();
    });
  }, [router]);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("event_date");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showNewGallery, setShowNewGallery] = useState(false);
  const [tab, setTab] = useState<"active" | "expired">("active");
  const [quickActionsItem, setQuickActionsItem] = useState<GalleryListItem | null>(null);
  // List or blocks (owner, 2026-10-24), remembered on this device (lib/galleriesView.ts).
  const [view, setView] = useState<GalleriesView>(initialView);
  const changeView = (next: GalleriesView) => {
    setView(next);
    document.cookie = galleriesViewCookie(next);
  };

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const handleRowClick = (e: React.MouseEvent, item: GalleryListItem) => {
    e.preventDefault();
    if (clickTimerRef.current) return;
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      router.push(`/galleries/${item.id}`);
    }, DOUBLE_CLICK_WINDOW_MS);
  };

  const handleRowDoubleClick = (e: React.MouseEvent, item: GalleryListItem) => {
    e.preventDefault();
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setQuickActionsItem(item);
  };

  const activeItems = useMemo(() => items.filter((i) => !i.archived), [items]);
  const expiredItems = useMemo(
    () =>
      [...items.filter((i) => i.archived)].sort(
        (a, b) => (a.permanentDeleteAt ?? "9999").localeCompare(b.permanentDeleteAt ?? "9999")
      ),
    [items]
  );

  if (resuming) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3" style={{ background: "var(--color-paper)" }}>
        <div className="h-8 w-8 rounded-full border-2 border-line border-t-ink animate-spin" />
        <p className="text-sm text-ink-soft">{t("טוען את הכלי...")}</p>
      </div>
    );
  }

  const copyLink = async (item: GalleryListItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = shortClientUrl(window.location.origin, "gallery", item.accessToken);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 1500);
    } catch {
      // clipboard unavailable — nothing more we can do here
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = activeItems;
    if (q) {
      list = list.filter(
        (item) => item.clientName.toLowerCase().includes(q) || item.title.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sortKey === "name") {
      sorted.sort((a, b) => a.clientName.localeCompare(b.clientName, "he"));
    } else if (sortKey === "expires") {
      sorted.sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
    } else {
      sorted.sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));
    }
    return sorted;
  }, [activeItems, query, sortKey]);

  return (
    <div className="pb-8">
      <BackLink href="/" label={t("חזרה לדף הבית")} className="mb-5" />
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-[26px] font-bold font-display">{t("גלריות")}</h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={changeView} />
          <button
            onClick={() => setShowNewGallery(true)}
            className="rounded-full px-4 py-2 text-sm font-semibold bg-ink text-white whitespace-nowrap"
          >
            + {t("גלריה חדשה")}
          </button>
        </div>
      </div>
      <PageGuide
        pageKey="galleries"
        blurb={t("כאן מרוכזות כל גלריות התמונות שיצרת ללקוחות. אפשר ליצור גלריה חדשה, להעלות תמונות, ולשלוח ללקוח קישור לצפייה ובחירה.")}
      />

      <div className="flex gap-1.5 mb-5">
        <button
          onClick={() => setTab("active")}
          className="flex-1 rounded-full py-2 text-xs font-semibold"
          style={{
            background: tab === "active" ? "var(--color-ink)" : "var(--color-chip)",
            color: tab === "active" ? "var(--color-paper)" : "var(--color-ink-soft)",
          }}
        >
          {t("גלריות")}
        </button>
        <button
          onClick={() => setTab("expired")}
          className="flex-1 rounded-full py-2 text-xs font-semibold"
          style={{
            background: tab === "expired" ? "var(--color-ink)" : "var(--color-chip)",
            color: tab === "expired" ? "var(--color-paper)" : "var(--color-ink-soft)",
          }}
        >
          {t("פג תוקף")}{expiredItems.length > 0 ? ` (${expiredItems.length})` : ""}
        </button>
      </div>

      {tab === "active" ? (
        <>
          <div className="flex gap-2 mb-5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("חיפוש לפי שם לקוח...")}
              // min-w-0: a text field doesn't shrink below its default width by itself, and on a
              // phone this row pushed the page 23px sideways (measured 2026-10-16).
              className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg px-2 py-2 text-sm border border-line bg-white"
            >
              <option value="event_date">{t("לפי תאריך אירוע")}</option>
              <option value="name">{t("לפי שם")}</option>
              <option value="expires">{t("לפי תוקף")}</option>
            </select>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-sm text-ink-soft">
              {activeItems.length === 0 ? t("עדיין אין גלריות. אפשר ליצור גלריה חדשה כאן, או מתוך כרטיס האירוע") : t("לא נמצאו תוצאות")}
            </div>
          )}

          <div className={view === "grid" ? GRID_CLASS : "space-y-3"}>
            {filtered.map((item) => {
              const meta = (
                <>
                  <div className={`font-semibold text-sm ${view === "grid" ? "leading-snug line-clamp-2" : "truncate"}`}>{item.title}</div>
                  <div className="text-xs text-ink-soft font-data">
                    {item.eventDate && new Date(item.eventDate).toLocaleDateString(dateLocale(lang))}, {t("{n} תמונות", { n: item.photoCount })}
                  </div>
                </>
              );
              const status = (
                <div className="text-[11px]">
                  {item.published ? (
                    <ToneTag tone="creative" legacyClassName="text-sage">
                      {t("פורסמה")}
                    </ToneTag>
                  ) : (
                    <ToneTag tone="neutral" legacyClassName="text-ink-soft">
                      {t("טיוטה")}
                    </ToneTag>
                  )}
                </div>
              );
              const upload = uploadByGallery.get(item.id) ? (
                <UploadLine upload={uploadByGallery.get(item.id)!} />
              ) : (
                remoteByGallery.get(item.id) && <RemoteUploadLine upload={remoteByGallery.get(item.id)!} />
              );
              const copy = item.published && (
                <button
                  onClick={(e) => copyLink(item, e)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                  style={{
                    background: copiedId === item.id ? "var(--color-sage-bg)" : "var(--color-chip)",
                    color: copiedId === item.id ? "var(--color-sage)" : "var(--color-ink-soft)",
                  }}
                >
                  {copiedId === item.id ? t("הועתק ✓") : t("העתקת קישור")}
                </button>
              );
              const linkProps = {
                href: `/galleries/${item.id}`,
                role: "button",
                title: t("לחיצה כפולה לפעולות מהירות (פורטפוליו, שיתוף, מחיקה)"),
                onClick: (e: React.MouseEvent) => handleRowClick(e, item),
                onDoubleClick: (e: React.MouseEvent) => handleRowDoubleClick(e, item),
              };
              return view === "grid" ? (
                <Link key={item.id} {...linkProps} className={GRID_CARD_CLASS}>
                  <div className="relative aspect-[4/5] bg-line">
                    <GalleryCover item={item} sizes={GRID_SIZES} />
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 p-3 min-w-0">
                    {meta}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-1.5 pt-2">
                      {status}
                      {copy}
                    </div>
                    {upload}
                  </div>
                </Link>
              ) : (
                <Link key={item.id} {...linkProps} className="flex items-center gap-3 rounded-2xl p-3 bg-card border border-line shadow-card">
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-line shrink-0">
                    <GalleryCover item={item} sizes="64px" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {meta}
                    <div className="mt-1">{status}</div>
                    {upload}
                  </div>
                  {copy}
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {expiredItems.length === 0 ? (
            <div className="text-center py-16 text-sm text-ink-soft">
              {t("אין כרגע גלריות שפג תוקפן או שנמחקו, כשגלריה פוקעת או נמחקת היא מופיעה כאן עד למחיקה הסופית")}
            </div>
          ) : (
            <div className={view === "grid" ? GRID_CLASS : "space-y-3"}>
              {expiredItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/galleries/${item.id}`}
                  role="button"
                  className={view === "grid" ? GRID_CARD_CLASS : "flex items-center gap-3 rounded-2xl p-3 bg-card border border-line shadow-card"}
                >
                  <div className={view === "grid" ? "relative aspect-[4/5] bg-line opacity-70" : "relative h-16 w-16 rounded-xl overflow-hidden bg-line shrink-0 opacity-70"}>
                    <GalleryCover item={item} sizes={view === "grid" ? GRID_SIZES : "64px"} />
                  </div>
                  <div className={view === "grid" ? "flex flex-1 flex-col gap-0.5 p-3 min-w-0" : "flex-1 min-w-0"}>
                    <div className={`font-semibold text-sm ${view === "grid" ? "leading-snug line-clamp-2" : "truncate"}`}>{item.title}</div>
                    <div className="text-xs text-ink-soft font-data">
                      {item.eventDate && new Date(item.eventDate).toLocaleDateString(dateLocale(lang))}, {t("{n} תמונות", { n: item.photoCount })}
                    </div>
                    {vivid ? (
                      // Vivid (admin): expired or deleted is archived (neutral); the final deletion
                      // date stays in the warning color.
                      <div className="text-[11px] mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <ToneTag tone="neutral">{item.archiveReason === "manual" ? t("נמחקה ידנית") : t("פג תוקף")}</ToneTag>
                        {item.permanentDeleteAt && (
                          <span style={{ color: "var(--tone-attention-ink)" }}>
                            {t("מחיקה סופית ב-{date}", { date: new Date(item.permanentDeleteAt).toLocaleDateString(dateLocale(lang)) })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] mt-1 text-rose">
                        {item.archiveReason === "manual" ? t("נמחקה ידנית") : t("פג תוקף")}
                        {item.permanentDeleteAt &&
                          `, ${t("מחיקה סופית ב-{date}", { date: new Date(item.permanentDeleteAt).toLocaleDateString(dateLocale(lang)) })}`}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {showNewGallery && <NewGalleryModal onClose={() => setShowNewGallery(false)} />}
      {quickActionsItem && (
        <GalleryQuickActionsMenu
          item={quickActionsItem}
          photographerName={photographerName}
          photographerEmail={photographerEmail}
          onClose={() => setQuickActionsItem(null)}
          onDeleted={() => setQuickActionsItem(null)}
        />
      )}
    </div>
  );
}

const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6";
const GRID_CARD_CLASS = "flex flex-col overflow-hidden rounded-2xl bg-card border border-line shadow-card";
// The page is 85% (sm) or 80% (lg) of the screen wide, split into 2–6 columns.
const GRID_SIZES = "(min-width: 1536px) 14vw, (min-width: 1024px) 16vw, (min-width: 640px) 28vw, 50vw";

// The gallery's cover, whole (owner, 2026-10-24: the square crop cut heads), over a blurred copy of
// itself that fills the rest of the box. The preview's tiny blur shows at once; without one, the same
// image (one download) is drawn blurred behind.
function GalleryCover({ item, sizes }: { item: GalleryListItem; sizes: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {item.coverBlur ? (
        <div
          className="absolute inset-0 scale-125 blur-md"
          style={{ backgroundImage: `url(${item.coverBlur})`, backgroundSize: "cover", backgroundPosition: "center" }}
          aria-hidden="true"
        />
      ) : (
        item.coverUrl && <Image src={item.coverUrl} alt="" aria-hidden="true" fill sizes={sizes} className="object-cover scale-125 blur-md" />
      )}
      {item.coverUrl && <Image src={item.coverUrl} alt={item.clientName} fill sizes={sizes} className="object-contain" />}
    </div>
  );
}

// One gallery's background upload, under its name in the list.
function UploadLine({ upload }: { upload: GalleryUpload }) {
  const t = useT();
  const running = upload.phase === "uploading";
  const videos = upload.kind === "videos";
  const text =
    upload.phase === "queued"
      ? videos
        ? t("בתור להעלאה, {n} סרטונים", { n: upload.total })
        : t("בתור להעלאה, {n} תמונות", { n: upload.total })
      : running
        ? t("מעלה {done} מתוך {total}", { done: upload.done, total: upload.total })
        : upload.phase === "offline"
          ? t("ההעלאה נעצרה, אין חיבור לאינטרנט")
          : upload.halted
            ? t("ההעלאה נעצרה, אף תמונה לא עלתה")
            : upload.phase === "cancelled"
              ? t("ההעלאה בוטלה")
              : upload.failed.length > 0
                ? t("הועלו {ok} מתוך {total}, {n} לא הועלו", { ok: upload.succeeded, total: upload.total, n: upload.failed.length })
                : videos
                  ? t("הועלו {n} סרטונים", { n: upload.succeeded })
                  : t("הועלו {n} תמונות", { n: upload.succeeded });
  const good = upload.phase === "done" && upload.failed.length === 0;
  return (
    <div className="mt-1.5" aria-live="polite">
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${good ? "text-sage" : upload.phase === "done" || upload.phase === "uploading" || upload.phase === "queued" ? "text-ink" : "text-rose"}`}>
        {(running || upload.phase === "queued") && (
          <span className={`h-3 w-3 shrink-0 rounded-full border-2 border-line border-t-ink ${running ? "animate-spin" : ""}`} aria-hidden="true" />
        )}
        {good && (
          <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
        <span className="truncate">{text}</span>
        {running && <span className="ms-auto shrink-0 font-data text-ink-soft">{Math.round(upload.pct)}%</span>}
      </div>
      {(running || upload.phase === "queued") && (
        <div className="mt-1 h-1 rounded-full bg-line overflow-hidden">
          <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${upload.pct}%` }} />
        </div>
      )}
    </div>
  );
}
