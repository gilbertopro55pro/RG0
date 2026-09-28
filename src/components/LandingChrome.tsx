import Link from "next/link";

// Shared chrome for the landing page and the public pages linked from its footer (terms, privacy,
// cookies, cancellation policy, accessibility, business info), so they read as one site in the
// landing palette (.landing-2026 in globals.css) instead of showing the app's own navigation.

export const LANDING_CONTAINER = "max-w-[1344px] mx-auto px-5 sm:px-8 lg:px-12";

export const FOOTER_LINKS = [
  { href: "/login", label: "כניסה למשתמשים קיימים" },
  { href: "/terms", label: "תקנון שימוש" },
  { href: "/privacy", label: "מדיניות פרטיות" },
  { href: "/cookies", label: "מדיניות עוגיות" },
  { href: "/cancellation-policy", label: "מדיניות ביטולים" },
  { href: "/accessibility", label: "הצהרת נגישות" },
  { href: "/business-info", label: "פרטי העסק" },
];

export function LandingLogo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[var(--l-on-navy)] w-fit">
      <span className="w-8 h-8 lg:w-9 lg:h-9 rounded-[8px] bg-[var(--l-accent)] text-[var(--l-on-accent)] flex items-center justify-center">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      </span>
      <span className="font-display text-[19px] lg:text-[21px] font-bold tracking-tight">גילברטו</span>
    </Link>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--l-line)] bg-[var(--l-bg)]">
      <div className={`${LANDING_CONTAINER} pt-7 pb-10 lg:pt-10 lg:pb-14 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5`}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-1.5 lg:gap-3">
          <span className="font-display text-[17px] lg:text-lg font-bold">גילברטו</span>
          <span className="text-[13px] lg:text-sm text-[var(--l-ink-soft)]">© {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט, צילום אירועים</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2.5">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-[var(--l-ink-soft)] hover:text-[var(--l-ink)]">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

// A legal/info page: navy bar with the logo, the page's own content in a readable column, and the
// landing footer. Headings, lists and links inside get the landing typography.
export function LegalPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-2026 min-h-screen flex flex-col font-sans">
      <header className="bg-[var(--l-navy)] text-[var(--l-on-navy)]">
        <div className={`${LANDING_CONTAINER} h-16 lg:h-[76px] flex items-center justify-between`}>
          <LandingLogo />
          <nav className="flex items-center gap-4 text-[15px]">
            <Link href="/" className="text-[var(--l-on-navy-soft)] hover:text-[var(--l-on-navy)]">
              לדף הבית
            </Link>
            <Link href="/signup" className="h-10 px-4 rounded-[1px] inline-flex items-center font-bold bg-[var(--l-accent)] text-[var(--l-on-accent)]">
              14 יום חינם
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 bg-[var(--l-bg)]">
        <article
          className="max-w-[760px] mx-auto px-5 sm:px-8 py-12 lg:py-20 text-base leading-[1.75] text-[var(--l-ink)]
            [&_h1]:font-display [&_h1]:text-4xl [&_h1]:lg:text-5xl [&_h1]:font-bold [&_h1]:tracking-[-0.03em] [&_h1]:leading-[1.1] [&_h1]:mb-3
            [&_h2]:font-display [&_h2]:text-xl [&_h2]:lg:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:pt-6
            [&_a]:text-[var(--l-accent)] [&_a]:underline [&_a]:underline-offset-4
            [&_li]:marker:text-[var(--l-accent)] [&_.text-ink-soft]:text-[var(--l-ink-soft)]"
        >
          {children}
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
