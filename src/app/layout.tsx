import type { Metadata, Viewport } from "next";
import { Heebo, Rubik, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import PWARegister from "@/components/PWARegister";
import TopNav from "@/components/TopNav";
import GlobalButtonEffects from "@/components/GlobalButtonEffects";
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
  title: "ניהול תהליך צילום אירועים",
  description: "מערכת לניהול תהליך צילום אירועים מסגירה עד מסירה",
  manifest: "/manifest.json",
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
  themeColor: "#f4e7d3",
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
      <body className="min-h-full flex flex-col">
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
            on a cold PWA launch on mobile; it self-removes via a CSS animation timer so it never
            depends on JS finishing to disappear. */}
        <style>{`
          @keyframes bootIconPulse { 0%, 100% { transform: scale(1); opacity: 0.88; } 50% { transform: scale(1.1); opacity: 1; } }
          #boot-splash {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f4e7d3;
            opacity: 1;
            visibility: visible;
            transition: opacity 0.4s ease;
          }
          #boot-splash.boot-splash-out {
            opacity: 0;
            visibility: hidden;
          }
          #boot-splash img {
            width: 76px;
            height: 76px;
            border-radius: 20px;
            box-shadow: 0 16px 36px rgba(32, 31, 51, 0.28);
            animation: bootIconPulse 1.1s ease-in-out infinite;
          }
        `}</style>
        {/* suppressHydrationWarning: the inline script below can add the boot-splash-out class
            to this node before React hydrates, which would otherwise be flagged as a mismatch
            even though it's an intentional, expected DOM mutation outside React's tree. */}
        <div id="boot-splash" suppressHydrationWarning>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" />
        </div>
        {/* Removing the splash is tied to the page actually being ready (the `load` event —
            covers slow networks/cold serverless starts, not just a guessed timeout) instead of a
            fixed CSS animation duration, which could hide the splash before real content painted
            and reveal a blank gap underneath on a slow load. The setTimeout is only a safety net
            in case `load` never fires for some reason, so the splash can never get stuck forever. */}
        <Script id="boot-splash-hide" strategy="beforeInteractive">
          {`
            (function () {
              function hideBootSplash() {
                var el = document.getElementById("boot-splash");
                if (el) el.classList.add("boot-splash-out");
              }
              if (document.readyState === "complete") {
                hideBootSplash();
              } else {
                window.addEventListener("load", hideBootSplash);
                setTimeout(hideBootSplash, 6000);
              }
            })();
          `}
        </Script>

        <PWARegister />
        <GlobalButtonEffects />
        <GlobalLoadingBar />
        <TopNav />
        {children}
        <InstallPrompt />
        <ChangelogModal />
      </body>
    </html>
  );
}
