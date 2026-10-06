import { optimizedImageUrl } from "@/lib/imageOptimize";

// The "premium" theme's cover (coverStyle: "fullbleed"): the cover photo fills the first screen,
// with the title and date set low over a soft scrim. It is the only bold moment of the page and
// its only unprompted motion: the photo settles from a slight zoom once, on load.
// variant "preview" is the same composition shrunk into a box, for the design settings' preview.
// variant "manage" is the same cover at the top of the photographer's own gallery screen, a little
// shorter so the gallery's bar shows below it on the first screen.
const COVER_WIDTHS = [828, 1200, 1920, 2048];

export default function GalleryPremiumCover({
  photoUrl,
  title,
  dateLabel,
  logoUrl,
  focalX = 50,
  focalY = 50,
  scrollLabel,
  variant = "page",
  textPosition = "below",
  shape = "rectangle",
}: {
  photoUrl: string | null;
  title: string;
  dateLabel: string | null;
  // The photographer's own logo (Studio Pro branding). Nothing is shown when there is none: the
  // photographer's personal name is not a brand, so it never stands in for one.
  logoUrl?: string | null;
  focalX?: number;
  focalY?: number;
  // aria-label of the scroll cue (page variant only).
  scrollLabel?: string;
  variant?: "page" | "preview" | "manage";
  // The design settings' "מיקום הכיתוב" and "צורת התמונה" (owner, 2026-10-06: the premium theme gets
  // the same controls as the others). Text: "below" = low on the photo (the original premium look),
  // "above" = high, "center-left"/"center-right" = vertically centered at that side. Shape:
  // "rectangle" = the full first screen (the original), "banner" = a shorter cover, "square" /
  // "circle" = the photo framed in that shape over a blurred copy of itself.
  textPosition?: string;
  shape?: string;
}) {
  const isPage = variant === "page";
  const isManage = variant === "manage";
  const srcSet =
    photoUrl && (isPage || isManage) && !photoUrl.startsWith("blob:") && !photoUrl.startsWith("data:")
      ? COVER_WIDTHS.map((w) => `${optimizedImageUrl(photoUrl, w)} ${w}w`).join(", ")
      : undefined;

  const framed = shape === "square" || shape === "circle";
  const isBanner = shape === "banner";
  const pos = textPosition === "above" || textPosition === "center-left" || textPosition === "center-right" ? textPosition : "below";
  const side = pos === "center-left" ? "left" : pos === "center-right" ? "right" : null;
  // The scrim darkens only where the text sits, so the rest of the photo stays untouched.
  const scrim =
    pos === "above"
      ? "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 32%, rgba(0,0,0,0) 58%)"
      : side
        ? `linear-gradient(to ${side === "left" ? "right" : "left"}, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.18) 38%, rgba(0,0,0,0) 62%)`
        : "linear-gradient(to top, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.22) 32%, rgba(0,0,0,0) 58%)";
  const big = isPage || isManage;
  const pad = isPage ? "px-6 sm:px-12 lg:px-20" : isManage ? "px-6 sm:px-12 lg:px-20" : "px-4";
  const textBox =
    pos === "above"
      ? `absolute inset-x-0 top-0 ${pad} ${logoUrl ? (big ? "pt-24 sm:pt-28" : "pt-9") : big ? "pt-[clamp(40px,9svh,96px)]" : "pt-4"}`
      : side
        ? `absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"} flex flex-col justify-center ${pad} ${big ? "max-w-[min(560px,62%)]" : "max-w-[62%]"}`
        : `absolute inset-x-0 bottom-0 ${pad} ${isPage ? "pb-[clamp(56px,11svh,112px)]" : isManage ? "pb-12 sm:pb-16" : "pb-4"}`;
  // A framed photo sits centred, or on the far side from text placed at a side.
  const frameStyle: React.CSSProperties = {
    // Beside text the frame stays under half the width, so the two never overlap on a phone.
    height: big ? (side ? "min(64%, 42vw)" : "min(64%, 78vw)") : side ? "min(64%, 42%)" : "64%",
    aspectRatio: "1 / 1",
    borderRadius: shape === "circle" ? "50%" : "2px",
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
    top: "50%",
    ...(side === "left" ? { right: big ? "8%" : "6%" } : side === "right" ? { left: big ? "8%" : "6%" } : { left: "50%" }),
    transform: side ? "translateY(-50%)" : "translate(-50%, -50%)",
  };

  return (
    <header
      className={`gt-premium-cover relative overflow-hidden ${
        isBanner
          ? isPage
            ? "h-[62svh] min-h-[340px]"
            : isManage
              ? "h-[46svh] min-h-[280px]"
              : "aspect-[16/8]"
          : isPage
            ? "h-[92svh] sm:h-[100svh] min-h-[420px]"
            : isManage
              ? "h-[64svh] sm:h-[calc(100svh-150px)] min-h-[320px]"
              : "aspect-[4/3]"
      }`}
      style={{ background: "#2b2c2f" }}
    >
      {isPage && (
        <style>{`
          @keyframes gt-cover-settle { from { transform: scale(1.04); } to { transform: scale(1); } }
          .gt-premium-cover .gt-cover-img { animation: gt-cover-settle 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
          @media (prefers-reduced-motion: reduce) { .gt-premium-cover .gt-cover-img { animation: none; } }
        `}</style>
      )}
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          srcSet={srcSet}
          sizes={srcSet ? "100vw" : undefined}
          alt=""
          fetchPriority={isPage ? "high" : undefined}
          className="gt-cover-img absolute inset-0 h-full w-full object-cover"
          style={{
            objectPosition: `${focalX}% ${focalY}%`,
            ...(framed ? { filter: "blur(26px) brightness(0.72)", transform: "scale(1.12)" } : {}),
          }}
        />
      )}
      {photoUrl && framed && (
        <div className="absolute overflow-hidden" style={frameStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} srcSet={srcSet} sizes={srcSet ? "80vh" : undefined} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${focalX}% ${focalY}%` }} />
        </div>
      )}
      <div aria-hidden="true" className="absolute inset-0" style={{ background: scrim }} />
      {logoUrl && (
        <div className={`absolute inset-x-0 top-0 flex justify-center ${isPage || isManage ? "pt-5 sm:pt-7" : "pt-2.5"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            className={`w-auto object-contain ${isPage || isManage ? "h-10 sm:h-12 max-w-[180px]" : "h-5 max-w-[80px]"}`}
            style={{ filter: "drop-shadow(0 1px 8px rgba(0,0,0,0.35))" }}
          />
        </div>
      )}
      <div className={`${textBox} text-white`} style={side ? { textAlign: side, direction: "rtl" } : undefined}>
        <h1
          className={side ? "" : "max-w-[16ch]"}
          style={{
            fontFamily: "var(--font-gallery-serif), serif",
            fontWeight: 300,
            fontSize: big ? (side || framed ? "clamp(34px, 5.6vw, 64px)" : "clamp(40px, 7.4vw, 76px)") : side || framed ? "20px" : "26px",
            lineHeight: 1.04,
            letterSpacing: "-0.01em",
            textWrap: "balance",
            textShadow: "0 2px 24px rgba(0,0,0,0.25)",
          }}
        >
          {title}
        </h1>
        {dateLabel && (
          <p className={`text-white/85 ${isPage || isManage ? "mt-3 sm:mt-4 text-sm sm:text-base" : "mt-1.5 text-[10px]"}`}>{dateLabel}</p>
        )}
      </div>
      {isPage && (
        <a
          href="#gallery-content"
          aria-label={scrollLabel}
          className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex h-10 w-10 items-center justify-center text-white/80 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9.5l6 6 6-6" />
          </svg>
        </a>
      )}
    </header>
  );
}
