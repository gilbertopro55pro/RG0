import type { Metadata, Viewport } from "next";
import { Heebo, Rubik, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import PWARegister from "@/components/PWARegister";
import TopNav from "@/components/TopNav";
import GlobalButtonEffects from "@/components/GlobalButtonEffects";
import BodyScrollLock from "@/components/BodyScrollLock";
import GlobalLoadingBar from "@/components/GlobalLoadingBar";
import InstallPrompt from "@/components/InstallPrompt";
import ChangelogModal from "@/components/ChangelogModal";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["latin", "hebrew"],
  weight: ["500", "700", "800", "900"],
});

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["500"],
});

// Physical-pixel splash images (public/splash) matched to CSS size + device-pixel-ratio, so iOS
// shows the app's own gradient-and-camera-icon splash the instant the icon is tapped — the
// native pre-paint step this app otherwise has zero control over — instead of a blank/black
// screen until the in-page #boot-splash below gets to paint. Portrait-only since the app is
// locked to portrait orientation.
const SPLASH_DEVICES: { cssW: number; cssH: number; dpr: number; file: string }[] = [
  { cssW: 320, cssH: 568, dpr: 2, file: "640x1136.png" },
  { cssW: 375, cssH: 667, dpr: 2, file: "750x1334.png" },
  { cssW: 414, cssH: 736, dpr: 3, file: "1242x2208.png" },
  { cssW: 375, cssH: 812, dpr: 3, file: "1125x2436.png" },
  { cssW: 414, cssH: 896, dpr: 2, file: "828x1792.png" },
  { cssW: 414, cssH: 896, dpr: 3, file: "1242x2688.png" },
  { cssW: 390, cssH: 844, dpr: 3, file: "1170x2532.png" },
  { cssW: 428, cssH: 926, dpr: 3, file: "1284x2778.png" },
  { cssW: 393, cssH: 852, dpr: 3, file: "1179x2556.png" },
  { cssW: 430, cssH: 932, dpr: 3, file: "1290x2796.png" },
  { cssW: 768, cssH: 1024, dpr: 2, file: "1536x2048.png" },
  { cssW: 810, cssH: 1080, dpr: 2, file: "1620x2160.png" },
  { cssW: 834, cssH: 1112, dpr: 2, file: "1668x2224.png" },
  { cssW: 834, cssH: 1194, dpr: 2, file: "1668x2388.png" },
  { cssW: 1024, cssH: 1366, dpr: 2, file: "2048x2732.png" },
];

export const metadata: Metadata = {
  metadataBase: new URL("https://myframeflow.com"),
  title: "ניהול תהליך צילום אירועים",
  description: "מערכת לניהול תהליך צילום אירועים מסגירה עד מסירה",
  manifest: "/manifest.json",
  openGraph: {
    title: "גילברטו — ניהול תהליך צילום אירועים",
    description: "מערכת לניהול תהליך צילום אירועים מסגירה עד מסירה",
    siteName: "גילברטו",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: "גילברטו — ניהול תהליך צילום אירועים",
    description: "מערכת לניהול תהליך צילום אירועים מסגירה עד מסירה",
    images: ["/icons/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "צילום אירועים",
    startupImage: SPLASH_DEVICES.map((d) => ({
      url: `/splash/${d.file}`,
      media: `(device-width: ${d.cssW}px) and (device-height: ${d.cssH}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`,
    })),
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#d5c9bb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${rubik.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* Sets data-theme on <html> from localStorage before first paint, so dark-mode users
            never see a flash of the light palette. Must run before the boot-splash removal and
            before hydration — same beforeInteractive pattern as that script below. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                if (localStorage.getItem("theme") === "dark") {
                  document.documentElement.setAttribute("data-theme", "dark");
                }
              } catch (e) {}
            })();
          `}
        </Script>
        {/* Pure-CSS boot splash — rendered in the initial server HTML, so it paints instantly
            even before the JS bundle loads/hydrates. This is what covers the black-screen gap
            on a cold PWA launch on mobile (the native per-device /splash/*.png startupImage
            covers the OS's own pre-paint gap on iOS; this in-page splash is what's visible from
            the moment OUR html starts rendering). It self-removes via a real readiness signal so
            it never depends on a guessed timeout to disappear.

            Two-stage on purpose: it paints STATIC first (logo only, no motion, no bar) so there's
            a clean single frame the instant content appears, then ~200ms later gains the
            `boot-splash-dynamic` class — starting the icon's pulse and revealing the progress
            bar — rather than everything animating from the very first frame. */}
        <style>{`
          @keyframes bootIconPulse { 0%, 100% { transform: scale(1); opacity: 0.88; } 50% { transform: scale(1.1); opacity: 1; } }
          @keyframes bootWaveScroll { from { background-position-x: 0; } to { background-position-x: 34px; } }
          #boot-splash {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 26px;
            background: #d5c9bb;
            opacity: 1;
            visibility: visible;
            transition: opacity 0.4s ease;
          }
          #boot-splash.boot-splash-out {
            opacity: 0;
            visibility: hidden;
          }
          #boot-splash img {
            width: 114px;
            height: 114px;
            border-radius: 26px;
            box-shadow: 0 16px 36px rgba(32, 31, 51, 0.28);
          }
          #boot-splash.boot-splash-dynamic img {
            animation: bootIconPulse 1.1s ease-in-out infinite;
          }
          #boot-progress {
            width: 168px;
            height: 12px;
            border-radius: 999px;
            background: rgba(46, 49, 66, 0.12);
            box-shadow: inset 0 1px 3px rgba(32, 31, 51, 0.18);
            overflow: hidden;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.35s ease, transform 0.35s ease;
          }
          #boot-splash.boot-splash-dynamic #boot-progress {
            opacity: 1;
            transform: translateY(0);
          }
          #boot-progress-fill {
            position: relative;
            height: 100%;
            width: 0%;
            border-radius: inherit;
            background: linear-gradient(180deg, #4ecb7d, #2fae5c);
            transition: width 0.3s ease-out;
            overflow: hidden;
          }
          #boot-progress-fill::after {
            content: "";
            position: absolute;
            top: 0;
            left: -34px;
            right: -34px;
            bottom: 0;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='12' viewBox='0 0 34 12'%3E%3Cpath d='M0 6 Q 8.5 0 17 6 T 34 6 V12 H0 Z' fill='rgba(255,255,255,0.35)'/%3E%3C/svg%3E");
            background-repeat: repeat-x;
            background-size: 34px 12px;
            animation: bootWaveScroll 0.9s linear infinite;
          }
        `}</style>
        {/* suppressHydrationWarning: the inline script below mutates this subtree (adding
            boot-splash-dynamic/boot-splash-out classes, setting the fill's width) before React
            hydrates, which would otherwise be flagged as a mismatch even though it's an
            intentional, expected DOM mutation outside React's tree. */}
        <div id="boot-splash" suppressHydrationWarning>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" />
          <div id="boot-progress" suppressHydrationWarning>
            <div id="boot-progress-fill" suppressHydrationWarning />
          </div>
        </div>
        {/* Drives the boot splash end-to-end:
            1. After a short real pause, switches from the static single-frame logo into the
               dynamic state (pulse animation + progress bar fades in) — see the comment above.
            2. Tracks REAL loading progress (not a simulated timer): document.readyState
               transitions plus a poll of the Resource Timing API (finished vs. discovered
               script/stylesheet requests) drive the bar from ~5% up to ~90%; only the actual
               `load` event is allowed to push it to 100%.
            3. Only hides the splash once the bar has visually reached 100% (a brief delay after
               setting width so the fill's own CSS transition finishes) — never before, and never
               tied to a fixed duration that could hide it before real content painted. The
               setTimeout(…, 6000) is only a safety net in case `load` never fires. */}
        <Script id="boot-splash-hide" strategy="beforeInteractive">
          {`
            (function () {
              var splash = document.getElementById("boot-splash");
              var fill = document.getElementById("boot-progress-fill");
              var pct = 0;
              function setPct(p) {
                pct = Math.max(pct, Math.min(100, p));
                if (fill) fill.style.width = pct + "%";
              }
              function estimateFromResources() {
                try {
                  var res = performance.getEntriesByType("resource");
                  var total = Math.max(
                    document.querySelectorAll('script[src], link[rel="stylesheet"]').length,
                    4
                  );
                  var done = 0;
                  for (var i = 0; i < res.length; i++) {
                    if (res[i].responseEnd > 0) done++;
                  }
                  setPct(15 + Math.min(done / total, 1) * 75);
                } catch (e) {}
              }
              setPct(5);
              document.addEventListener("readystatechange", function () {
                if (document.readyState === "interactive") setPct(20);
                estimateFromResources();
              });
              var poll = setInterval(estimateFromResources, 150);
              function hideBootSplash() {
                clearInterval(poll);
                setPct(100);
                setTimeout(function () {
                  if (splash) splash.classList.add("boot-splash-out");
                  document.body.classList.add("app-content-in");
                }, 350);
              }
              if (document.readyState === "complete") {
                hideBootSplash();
              } else {
                window.addEventListener("load", hideBootSplash);
                setTimeout(hideBootSplash, 6000);
              }
              setTimeout(function () {
                if (splash) splash.classList.add("boot-splash-dynamic");
              }, 200);
            })();
          `}
        </Script>

        <PWARegister />
        <GlobalButtonEffects />
        <BodyScrollLock />
        <GlobalLoadingBar />
        <TopNav />
        {children}
        <InstallPrompt />
        <ChangelogModal />
      </body>
    </html>
  );
}
