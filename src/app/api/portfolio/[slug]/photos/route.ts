import { NextResponse } from "next/server";
import { loadPortfolio, scopePortfolioPhotos, signPortfolioPhotos, sampleHeroPhotos, PORTFOLIO_PAGE_SIZE, PORTFOLIO_HERO_SAMPLE } from "@/lib/portfolio";

// Public "load more" for the portfolio grid (PortfolioGrid.tsx) — the page itself only signs the
// first PORTFOLIO_PAGE_SIZE photos; each scroll-triggered call here signs just the next page.
// Same gate and same `tabs`/`category` scoping as the page (via src/lib/portfolio.ts), so a
// curated share link's restriction can't be sidestepped by calling this directly.
// `sub` narrows to a sub-tab. `sample=1` returns a random mix of the scope instead of a page, for
// the hero strip inside a tab (PortfolioBrowser), with each photo's aspect ratio.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const data = await loadPortfolio(slug);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { gridPhotos } = scopePortfolioPhotos(
    data.photos,
    searchParams.get("tabs") ?? undefined,
    searchParams.get("category") ?? undefined,
    searchParams.get("sub") ?? undefined
  );
  if (searchParams.get("sample")) {
    const picked = sampleHeroPhotos(gridPhotos, PORTFOLIO_HERO_SAMPLE);
    const signed = await signPortfolioPhotos(picked);
    return NextResponse.json({ photos: picked.map((p) => ({ id: p.id, url: signed.get(p.id)!, aspect: p.preview_aspect_ratio })) });
  }
  const page = gridPhotos.slice(offset, offset + PORTFOLIO_PAGE_SIZE);
  const urlById = await signPortfolioPhotos(page);

  return NextResponse.json({
    photos: page.map((p) => ({ id: p.id, url: urlById.get(p.id)! })),
    hasMore: offset + page.length < gridPhotos.length,
  });
}
