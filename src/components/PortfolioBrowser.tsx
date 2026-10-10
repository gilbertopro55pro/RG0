"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import PortfolioGrid, { type GridPhoto } from "@/components/PortfolioGrid";

const BRASS = "#c9a24b";
const TEXT_SOFT = "#b7b7bd";

type Loaded = { photos: GridPhoto[]; hasMore: boolean };

// The public portfolio's tab tiles and photo grid. Tapping a tab switches the grid in place
// (owner, 2026-10-10: "המעבר יהיה חלק בלי מסך הטעינה"): the address changes with pushState, so the
// link and the back button still work, but nothing reloads. A tab's first page comes from
// /api/portfolio/[slug]/photos, and what was loaded is kept, so going back to a tab is instant.
export default function PortfolioBrowser({
  slug,
  tabs,
  categories,
  initialCategory,
  initialPhotos,
  initialHasMore,
}: {
  slug: string;
  tabs?: string;
  categories: { name: string; thumb: string | null }[];
  initialCategory?: string;
  initialPhotos: GridPhoto[];
  initialHasMore: boolean;
}) {
  const searchParams = useSearchParams();
  const active = searchParams.get("category") ?? undefined;
  const [loaded, setLoaded] = useState<Map<string, Loaded>>(() => new Map([[initialCategory ?? "", { photos: initialPhotos, hasMore: initialHasMore }]]));
  const current = loaded.get(active ?? "");

  const hrefFor = (category?: string) => {
    const qs = new URLSearchParams();
    if (category) qs.set("category", category);
    if (tabs) qs.set("tabs", tabs);
    const query = qs.toString();
    return `/p/${slug}${query ? `?${query}` : ""}`;
  };
  // A plain link stays (open in a new tab works); a normal tap switches in place.
  const select = (e: React.MouseEvent, category?: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (category === active) return;
    window.history.pushState(null, "", hrefFor(category));
  };

  return (
    <>
      {/* Category navigation as photo tiles rather than plain pills — each tab is a real image from
          that category (the cover the photographer picked, or its newest photo), matching a
          photography portfolio's own visual language. */}
      {categories.length > 0 && (
        <div className="px-6 py-12" style={{ background: "#151517" }}>
          <p className="text-center text-xs font-semibold mb-6" style={{ color: TEXT_SOFT }}>
            נושאים
          </p>
          <div className="flex flex-wrap justify-center gap-5 max-w-4xl mx-auto select-none" style={{ WebkitTouchCallout: "none" }}>
            <a href={hrefFor()} onClick={(e) => select(e)} className="flex flex-col items-center gap-2 w-24" aria-current={!active ? "page" : undefined}>
              <span
                className="h-24 w-24 rounded-lg flex items-center justify-center text-[11px] font-semibold transition-shadow"
                style={{
                  background: !active ? BRASS : "#232326",
                  color: !active ? "#1a1408" : TEXT_SOFT,
                  boxShadow: !active ? `0 0 0 2px ${BRASS}` : undefined,
                }}
              >
                הכל
              </span>
              <span className="text-[11px]" style={{ color: !active ? "#f2f2ee" : TEXT_SOFT }}>
                הכל
              </span>
            </a>
            {categories.map((c) => (
              <a
                key={c.name}
                href={hrefFor(c.name)}
                onClick={(e) => select(e, c.name)}
                className="flex flex-col items-center gap-2 w-24"
                aria-current={active === c.name ? "page" : undefined}
              >
                <span
                  className="h-24 w-24 rounded-lg overflow-hidden bg-black/40 transition-shadow"
                  style={{ boxShadow: active === c.name ? `0 0 0 2px ${BRASS}` : undefined }}
                >
                  {c.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumb} alt="" draggable={false} className="h-full w-full object-cover" onContextMenu={(e) => e.preventDefault()} />
                  )}
                </span>
                <span className="text-[11px] leading-snug text-center line-clamp-2 max-w-full" style={{ color: active === c.name ? "#f2f2ee" : TEXT_SOFT }}>
                  {c.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 sm:px-6 py-10 min-h-[60vh]" style={{ background: "#0b0b0d" }}>
        <PortfolioGrid
          key={`${active ?? ""}|${tabs ?? ""}`}
          slug={slug}
          initialPhotos={current?.photos ?? []}
          initialHasMore={current ? current.hasMore : true}
          category={active}
          tabs={tabs}
          emptyText={active ? "אין עדיין תמונות בנושא הזה." : "תיק העבודות עדיין ריק."}
          onPhotos={(photos, hasMore) => setLoaded((prev) => new Map(prev).set(active ?? "", { photos, hasMore }))}
        />
      </div>
    </>
  );
}
