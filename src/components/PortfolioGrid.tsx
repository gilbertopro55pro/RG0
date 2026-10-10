"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PortfolioLightbox from "@/components/PortfolioLightbox";

export type GridPhoto = { id: string; url: string };

// The public portfolio's photo grid, loaded progressively — the server renders (and signs) only
// the first page, and each time the visitor nears the bottom, the next page is fetched from
// /api/portfolio/[slug]/photos. A portfolio can hold thousands of photos (2,471 on a real account
// at the time of writing); signing and rendering all of them up front made the first visit slow
// and the page tens of thousands of pixels tall before anyone scrolled at all.
// A tab opened without its first page (PortfolioBrowser switches tabs in place) starts empty and
// loads it right away, with a spinner. Tapping a photo opens it full screen (PortfolioLightbox).
export default function PortfolioGrid({
  slug,
  initialPhotos,
  initialHasMore,
  category,
  tabs,
  emptyText,
  onPhotos,
}: {
  slug: string;
  initialPhotos: GridPhoto[];
  initialHasMore: boolean;
  category?: string;
  tabs?: string;
  emptyText: string;
  // What's loaded so far, so switching back to this tab shows it at once.
  onPhotos?: (photos: GridPhoto[], hasMore: boolean) => void;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const indexById = new Map(photos.map((p, i) => [p.id, i]));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  // Explicit columns (photo i always lands in column i % n) rather than CSS `columns`: with CSS
  // columns, every appended batch rebalances the WHOLE grid, so photos the visitor is already
  // looking at jump between columns each time more load. This way new photos only ever extend
  // the bottom. Starts at 2 (matches the server render), widens to 3 on md+ after mount.
  const [columnCount, setColumnCount] = useState(2);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setColumnCount(mq.matches ? 3 : 2);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const columns = Array.from({ length: columnCount }, (_, c) => photos.filter((_, i) => i % columnCount === c));

  useEffect(() => {
    onPhotos?.(photos, hasMore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, hasMore]);

  const loadMore = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const qs = new URLSearchParams({ offset: String(photos.length) });
      if (category) qs.set("category", category);
      if (tabs) qs.set("tabs", tabs);
      const res = await fetch(`/api/portfolio/${encodeURIComponent(slug)}/photos?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      const data: { photos: GridPhoto[]; hasMore: boolean } = await res.json();
      setPhotos((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...data.photos.filter((p) => !seen.has(p.id))];
      });
      setHasMore(data.hasMore);
    } catch {
      setFailed(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || failed) return;
    // Starts fetching well before the visitor actually hits the bottom, so the next photos are
    // usually already there by the time they scroll to them.
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: "1200px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, failed, photos.length]);

  // The lightbox asks for more as it reaches the end of what's loaded.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });
  const nearEnd = useCallback(() => {
    if (hasMore && !failed) void loadMoreRef.current();
  }, [hasMore, failed]);

  if (photos.length === 0 && !hasMore) {
    return (
      <p className="text-center text-sm py-16" style={{ color: "#b7b7bd" }}>
        {emptyText}
      </p>
    );
  }

  return (
    <>
      {/* No long-press callout, drag or right-click menu on the photos: the portfolio is for viewing. */}
      <div className="flex gap-1 max-w-5xl mx-auto items-start select-none" style={{ WebkitTouchCallout: "none" }} onContextMenu={(e) => e.preventDefault()}>
        {columns.map((col, c) => (
          <div key={c} className="flex-1 min-w-0 flex flex-col gap-1">
            {col.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.url}
                alt=""
                className="w-full h-auto cursor-zoom-in"
                loading="lazy"
                draggable={false}
                onClick={() => setOpenIndex(indexById.get(p.id) ?? 0)}
              />
            ))}
          </div>
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className={`flex justify-center ${photos.length === 0 ? "py-24" : "py-8"}`}>
          {failed ? (
            <button onClick={loadMore} className="rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "#232326", color: "#b7b7bd" }}>
              טעינת תמונות נוספות
            </button>
          ) : photos.length === 0 ? (
            <span className="h-8 w-8 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(201,162,75,0.25)", borderTopColor: "#c9a24b" }} aria-label="טוען תמונות" />
          ) : (
            <span className="text-xs" style={{ color: "#b7b7bd", opacity: loading ? 1 : 0 }}>
              טוען תמונות...
            </span>
          )}
        </div>
      )}
      {openIndex !== null && (
        <PortfolioLightbox photos={photos} index={openIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} onNearEnd={nearEnd} />
      )}
    </>
  );
}
