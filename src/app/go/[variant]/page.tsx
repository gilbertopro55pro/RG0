import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandingPage, { landingMetadata } from "@/components/LandingPage";

// Three share links for the landing page, each with its own link preview (owner, 2026-10-11): the
// same Hebrew landing page, but WhatsApp/Facebook show a different image and hook for each, so the
// owner can see which one people open. A redirect wouldn't do: a preview is read from the page the
// link lands on. Static like /landing, canonical "/" and not indexed, so search engines see one page.
// Public in the proxy (PUBLIC_PATHS). Images: public/og/go-*.jpg (scripts/landing-og/variants.mjs).
const VARIANTS: Record<string, { title: string; description: string }> = {
  // The founder's photo.
  "1": {
    title: "הצילום נגמר בחצות. הוואטסאפים לא.",
    description: "גילברטו לוקחת על עצמה את ההודעות, החוזים והתשלומים, ואתם חוזרים לצלם. 14 ימי ניסיון חינם.",
  },
  // The logo, the admin hours.
  "2": {
    title: "4.5 שעות על כל אירוע, ואף אחת מהן מאחורי המצלמה.",
    description: "הודעות, חוזים, תזכורות ובחירת תמונות. גילברטו לוקחת את רוב העבודה הזו. 14 ימי ניסיון חינם.",
  },
  // The logo with a night chat, the intake assistant.
  "3": {
    title: "כמה אירועים הפסדתם כי עניתם מאוחר מדי?",
    description: "עוזר הפניות של גילברטו עונה ללקוחות מיד, גם בשתיים בלילה, ובודק ביומן שהתאריך פנוי. 14 ימי ניסיון חינם.",
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function generateMetadata({ params }: { params: Promise<{ variant: string }> }): Promise<Metadata> {
  const { variant } = await params;
  const v = VARIANTS[variant];
  const base = landingMetadata("he");
  if (!v) return base;
  const image = { url: `/og/go-${variant}.jpg`, width: 1200, height: 630, alt: v.title };
  return {
    ...base,
    robots: { index: false, follow: true },
    openGraph: { ...base.openGraph, title: v.title, description: v.description, url: `/go/${variant}`, images: [image] },
    twitter: { card: "summary_large_image", title: v.title, description: v.description, images: [image.url] },
  };
}

export default async function LandingShareRoute({ params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  if (!VARIANTS[variant]) notFound();
  return <LandingPage lang="he" />;
}
