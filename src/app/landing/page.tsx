import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";

// No dynamic APIs (cookies/headers) are used anywhere in this tree, so Next.js prerenders
// this route to static HTML at build time. Anonymous hits to "/" are rewritten here by the
// middleware before the Supabase auth check ever runs, so the marketing page is served from
// the static cache instead of paying a per-request auth round trip.
//
// A rewrite keeps the browser's URL bar at "/", but a search engine that somehow requests
// this path directly should still treat "/" as the one canonical URL for this content —
// otherwise the exact same page indexed under two paths dilutes both.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function LandingRoute() {
  return <LandingPage />;
}
