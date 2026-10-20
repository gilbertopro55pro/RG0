import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PortfolioPageView, { portfolioMetadata } from "@/components/PortfolioPageView";
import { loadPortfolio, NO_CATEGORY_TAB } from "@/lib/portfolio";
import { SHARE_CODE_RE, tabsForShareCode } from "@/lib/portfolioShareCode";

// The short link to some of the portfolio's tabs: /p/<slug>/<code> (lib/portfolioShareCode.ts). The
// code is matched against the photographer's tabs now; when none of them is left (renamed or
// removed since), the whole portfolio shows rather than an empty page — it's public at /p/<slug>
// anyway.
export async function generateMetadata({ params }: { params: Promise<{ slug: string; code: string }> }): Promise<Metadata> {
  return portfolioMetadata((await params).slug);
}

export default async function PortfolioShareCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; code: string }>;
  searchParams: Promise<{ category?: string; sub?: string }>;
}) {
  const { slug, code } = await params;
  if (!SHARE_CODE_RE.test(code)) notFound();
  const { category, sub } = await searchParams;
  const data = await loadPortfolio(slug);
  const allTabs = data
    ? [...new Set([...data.photos.map((p) => p.portfolio_category ?? NO_CATEGORY_TAB), ...data.videos.map((v) => v.portfolio_category ?? NO_CATEGORY_TAB)])]
    : [];
  const tabs = tabsForShareCode(code, allTabs);
  return (
    <PortfolioPageView
      slug={slug}
      data={data}
      tabsParam={tabs.length ? tabs.map(encodeURIComponent).join(",") : undefined}
      activeCategory={category}
      subParam={sub}
      basePath={`/p/${slug}/${code}`}
    />
  );
}
