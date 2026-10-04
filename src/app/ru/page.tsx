import LandingPage, { landingMetadata } from "@/components/LandingPage";

// The landing page in Russian, for ads (2026-10-04). Static like /landing: nothing in this tree reads
// cookies or headers. LandingPage wraps itself in ClientLangScope with this lang, so the page is
// Russian left-to-right whatever the device's ui_lang cookie says. Public in the proxy (PUBLIC_PATHS).
export const metadata = landingMetadata("ru");

export default function LandingRouteRussian() {
  return <LandingPage lang="ru" />;
}
