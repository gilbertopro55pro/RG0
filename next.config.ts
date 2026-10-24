import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Unique per build, baked into both the client bundle and the server — UpdateReloadGate compares
  // the one its (possibly hours-old) tab was built with against /api/version, which always answers
  // from whatever deployment is live now. Keyed on the deployment, not CHANGELOG's version, so a
  // silent update (no version bump) still prompts open tabs to reload onto the new code.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_DEPLOYMENT_ID || `build-${Date.now()}`,
  },
  // A screen visited in the last minute opens from the router's memory, instantly, instead of
  // waiting for the server again (owner, 2026-10-24: "חזרה למסך שכבר ביקרת בו תהיה מיידית").
  // Any save drops those copies before the next navigation (lib/dataChanges.ts, FreshNavigation).
  experimental: {
    staleTimes: { dynamic: 60 },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "photographer-flow.c33326344888118eb4a7a0a8b279e0bd.r2.cloudflarestorage.com",
        pathname: "/**",
      },
      // The photos' previews on the CDN (getPublicPreviewUrl), e.g. the covers on the galleries page.
      {
        protocol: "https",
        hostname: "cdn.myframeflow.com",
        pathname: "/previews/**",
      },
    ],
  },
  // The album PDF/JPG/PSD export routes all read Hebrew/Latin font files off disk at runtime
  // (pdf-lib and the sharp/SVG text renderer both need real font bytes). Output file tracing's
  // static analysis usually catches fs.readFile calls with literal paths, but this makes it
  // explicit so the font files are never silently dropped from the deployed function bundle.
  // A short, friendly signup link for ads and videos ("myframeflow.com/start", owner 2026-10-11).
  // Config redirects run before the auth proxy, so it works with no session.
  async redirects() {
    return [{ source: "/start", destination: "/signup", permanent: false }];
  },
  outputFileTracingIncludes: {
    "/api/galleries/\\[id\\]/album/export-pdf": ["src/assets/fonts/**/*"],
    "/api/galleries/\\[id\\]/album/export-jpg": ["src/assets/fonts/**/*"],
    "/api/galleries/\\[id\\]/album/export-psd": ["src/assets/fonts/**/*"],
    "/api/events/\\[id\\]/contract/pdf": ["src/assets/fonts/Rubik-Bold.ttf", "src/assets/fonts/Rubik-Regular.ttf"],
  },
};

export default nextConfig;
