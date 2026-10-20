import type { Metadata } from "next";
import PortfolioPageView, { portfolioMetadata } from "@/components/PortfolioPageView";
import { loadPortfolio } from "@/lib/portfolio";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tabs?: string }>;
}): Promise<Metadata> {
  const { tabs } = await searchParams;
  const decode = (t: string) => {
    try {
      return decodeURIComponent(t);
    } catch {
      return t;
    }
  };
  return portfolioMetadata((await params).slug, tabs ? tabs.split(",").map(decode) : null);
}

export default async function PortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // `tabs`: curated-share restriction — see scopePortfolioPhotos in src/lib/portfolio.ts.
  searchParams: Promise<{ category?: string; sub?: string; tabs?: string }>;
}) {
  const { slug } = await params;
  const { category, sub, tabs } = await searchParams;
  return <PortfolioPageView slug={slug} data={await loadPortfolio(slug)} tabsParam={tabs} activeCategory={category} subParam={sub} />;
}
