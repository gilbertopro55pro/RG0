import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/landing",
  "/login",
  "/signup",
  "/reset-password",
  // Must stay reachable with no session — Google's OAuth verification review and any visiting
  // browser both hit this with no cookie jar at all. Same for its sibling legal/disclosure pages.
  "/privacy",
  "/cookies",
  "/accessibility",
  "/business-info",
  "/terms",
  "/cancellation-policy",
  "/auth",
  "/api/auth",
  "/api/whatsapp/webhook",
  "/api/cron",
  "/contracts",
  "/api/contracts",
  "/portal",
  "/api/portal",
  "/quotes",
  "/api/quotes",
  "/gallery",
  "/api/gallery",
  "/p",
  // The public portfolio's "load more" (PortfolioGrid.tsx) — same public audience as "/p" itself.
  "/api/portfolio",
  "/api/payplus/webhook",
  // Bearer-token authenticated (not cookie-based) — the separate desktop app has no cookie jar
  // shared with this site, so it can't pass this proxy's cookie-session check. The route itself
  // independently validates the bearer token via supabase.auth.getUser(token), same as every other
  // entry in this list has its own token/session check baked into the route rather than the cookie.
  "/api/desktop",
  // Shared-secret authenticated (not a user session at all) — called only by the separate FTP
  // server (photographer-flow-ftp), which has no Supabase session. See its two routes' own
  // comments for the actual auth check.
  "/api/ftp-server",
];

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // "/" is always a public path, so the getClaims() result below never actually changes the
  // outcome for it — but every hit still paid the full JWT-verification round trip. Anonymous
  // traffic (ads, SEO, cold visits — the vast majority of "/" hits) carries no Supabase cookie
  // at all, so it's safe to skip the auth check entirely and rewrite straight to the static
  // marketing route instead. A logged-in user still reaches the real dynamic "/" dashboard
  // below, unaffected — this branch only fires when there is no session cookie to check.
  if (
    pathname === "/" &&
    !request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"))
  ) {
    return NextResponse.rewrite(new URL("/landing", request.url));
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() verifies the JWT locally against the project's cached JWKS (WebCrypto) instead
  // of calling the Auth server on every single request, now that the project uses asymmetric
  // signing keys — this was the single most frequent round trip in the app (it ran on every
  // navigation) and the main remaining source of the load-time gap after the query-batching pass.
  // Trade-off, accepted deliberately: a banned/deleted user keeps access until their JWT expires
  // (up to 1h), since this doesn't re-check against the Auth server the way getUser() does.
  const {
    data,
  } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Exact-or-subpath match only — a naive prefix check would let "/gallery" (public) also
  // match "/galleries" (photographer-only, unrelated), silently bypassing auth for it.
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  // A request carrying its own bearer token (the desktop app, which has no cookie jar shared
  // with this site) is a different auth mechanism entirely — the route itself validates the
  // token and rejects with its own 401 if it's missing/invalid, so gatekeeping it here on the
  // cookie session would just wrongly redirect a valid bearer-authenticated request to /login.
  // This is a general bypass (not a per-route PUBLIC_PATHS entry) so any current or future
  // bearer-token route works without editing this list each time.
  const hasBearerToken = request.headers.get("authorization")?.startsWith("Bearer ") ?? false;

  if (!user && !isPublicPath && !hasBearerToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
