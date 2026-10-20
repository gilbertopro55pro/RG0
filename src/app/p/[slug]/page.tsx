import type { Metadata } from "next";
import PortfolioPageView, { portfolioMetadata } from "@/components/PortfolioPageView";
import { loadPortfolio } from "@/lib/portfolio";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return portfolioMetadata((await params).slug);
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
