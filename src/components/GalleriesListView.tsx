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
  accessToken: string;
  expiryDays: 7 | 14 | 30 | 90 | 180 | 365 | null;
  restoredOnce: boolean;
};

type SortKey = "event_date" | "name" | "expires";

// A double-click on a row needs the single click's navigation delayed just long enough to know a
// second click isn't coming — with no delay at all, the first click of any double-click has
// already navigated away before the browser's dblclick event even fires.
const DOUBLE_CLICK_WINDOW_MS = 250;

export default function GalleriesListView({
  items,
  photographerName,
  photographerEmail,
}: {
  items: GalleryListItem[];
  photographerName: string;
  photographerEmail: string;
}) {
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

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("event_date");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showNewGallery, setShowNewGallery] = useState(false);
  const [tab, setTab] = useState<"active" | "expired">("active");
  const [quickActionsItem, setQuickActionsItem] = useState<GalleryListItem | null>(null);

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
        <p className="text-sm text-ink-soft">טוען את הכלי...</p>
      </div>
    );
  }

  const copyLink = async (item: GalleryListItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/gallery/${item.accessToken}`;
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
      <BackLink href="/" label="חזרה לדף הבית" className="mb-5" />
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[26px] font-bold font-display">גלריות</h1>
        <button
          onClick={() => setShowNewGallery(true)}
          className="rounded-full px-4 py-2 text-sm font-semibold bg-ink text-white"
        >
          + גלריה חדשה
        </button>
      </div>
      <PageGuide
        pageKey="galleries"
        blurb="כאן מרוכזות כל גלריות התמונות שיצרת ללקוחות. אפשר ליצור גלריה חדשה, להעלות תמונות, ולשלוח ללקוח קישור לצפייה ובחירה."
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
          גלריות
        </button>
        <button
          onClick={() => setTab("expired")}
          className="flex-1 rounded-full py-2 text-xs font-semibold"
          style={{
            background: tab === "expired" ? "var(--color-ink)" : "var(--color-chip)",
            color: tab === "expired" ? "var(--color-paper)" : "var(--color-ink-soft)",
          }}
        >
          פג תוקף{expiredItems.length > 0 ? ` (${expiredItems.length})` : ""}
        </button>
      </div>

      {tab === "active" ? (
        <>
          <div className="flex gap-2 mb-5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי שם לקוח..."
              className="flex-1 rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg px-2 py-2 text-sm border border-line bg-white"
            >
              <option value="event_date">לפי תאריך אירוע</option>
              <option value="name">לפי שם</option>
              <option value="expires">לפי תוקף</option>
            </select>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-sm text-ink-soft">
              {activeItems.length === 0 ? "עדיין אין גלריות. אפשר ליצור גלריה חדשה כאן, או מתוך כרטיס האירוע" : "לא נמצאו תוצאות"}
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((item) => (
              <Link
                key={item.id}
                href={`/galleries/${item.id}`}
                role="button"
                title="לחיצה כפולה לפעולות מהירות (פורטפוליו, שיתוף, מחיקה)"
                onClick={(e) => handleRowClick(e, item)}
                onDoubleClick={(e) => handleRowDoubleClick(e, item)}
                className="flex items-center gap-3 rounded-2xl p-3 bg-card border border-line shadow-card"
              >
                <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-line shrink-0">
                  {item.coverUrl && (
                    <Image src={item.coverUrl} alt={item.clientName} fill sizes="64px" className="object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{item.title}</div>
                  <div className="text-xs text-ink-soft font-data">
                    {item.eventDate && new Date(item.eventDate).toLocaleDateString("he-IL")}, {item.photoCount} תמונות
                  </div>
                  <div className="text-[11px] mt-1">
                    {item.published ? (
                      <span className="text-sage">פורסמה</span>
                    ) : (
                      <span className="text-ink-soft">טיוטה</span>
                    )}
                  </div>
                </div>
                {item.published && (
                  <button
                    onClick={(e) => copyLink(item, e)}
                    className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                    style={{
                      background: copiedId === item.id ? "var(--color-sage-bg)" : "var(--color-chip)",
                      color: copiedId === item.id ? "var(--color-sage)" : "var(--color-ink-soft)",
                    }}
                  >
                    {copiedId === item.id ? "הועתק ✓" : "העתקת קישור"}
                  </button>
                )}
              </Link>
            ))}
          </div>
        </>
      ) : (
        <>
          {expiredItems.length === 0 ? (
            <div className="text-center py-16 text-sm text-ink-soft">
              אין כרגע גלריות שפג תוקפן או שנמחקו, כשגלריה פוקעת או נמחקת היא מופיעה כאן עד למחיקה הסופית
            </div>
          ) : (
            <div className="space-y-3">
              {expiredItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/galleries/${item.id}`}
                  role="button"
                  className="flex items-center gap-3 rounded-2xl p-3 bg-card border border-line shadow-card"
                >
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-line shrink-0 opacity-70">
                    {item.coverUrl && (
                      <Image src={item.coverUrl} alt={item.clientName} fill sizes="64px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{item.title}</div>
                    <div className="text-xs text-ink-soft font-data">
                      {item.eventDate && new Date(item.eventDate).toLocaleDateString("he-IL")}, {item.photoCount} תמונות
                    </div>
                    <div className="text-[11px] mt-1 text-rose">
                      {item.archiveReason === "manual" ? "נמחקה ידנית" : "פג תוקף"}
                      {item.permanentDeleteAt &&
                        `, מחיקה סופית ב-${new Date(item.permanentDeleteAt).toLocaleDateString("he-IL")}`}
                    </div>
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
