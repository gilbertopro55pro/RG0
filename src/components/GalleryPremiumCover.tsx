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
}) {
  const isPage = variant === "page";
  const isManage = variant === "manage";
  const srcSet =
    photoUrl && (isPage || isManage) && !photoUrl.startsWith("blob:") && !photoUrl.startsWith("data:")
      ? COVER_WIDTHS.map((w) => `${optimizedImageUrl(photoUrl, w)} ${w}w`).join(", ")
      : undefined;

  return (
    <header
      className={`gt-premium-cover relative overflow-hidden ${
        isPage ? "h-[92svh] sm:h-[100svh] min-h-[420px]" : isManage ? "h-[64svh] sm:h-[calc(100svh-150px)] min-h-[320px]" : "aspect-[4/3]"
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
          style={{ objectPosition: `${focalX}% ${focalY}%` }}
        />
      )}
      {/* Scrim: only the lower part darkens, so the photo stays untouched where the eye lands. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.22) 32%, rgba(0,0,0,0) 58%)" }}
      />
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
      <div
        className={`absolute inset-x-0 bottom-0 text-white ${
          isPage ? "px-6 pb-[clamp(56px,11svh,112px)] sm:px-12 lg:px-20" : isManage ? "px-6 pb-12 sm:px-12 sm:pb-16 lg:px-20" : "px-4 pb-4"
        }`}
      >
        <h1
          className="max-w-[16ch]"
          style={{
            fontFamily: "var(--font-gallery-serif), serif",
            fontWeight: 300,
            fontSize: isPage ? "clamp(40px, 7.4vw, 76px)" : isManage ? "clamp(40px, 7.4vw, 76px)" : "26px",
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
