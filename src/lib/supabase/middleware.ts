import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/reset-password",
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
  "/api/payplus/webhook",
];

export async function updateSession(request: NextRequest) {
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
  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!user && !isPublicPath) {
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
