import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Fixed-window counter (not sliding-window or token-bucket) backed by rate_limit_windows —
// simple, no external dependency (no Redis/Upstash), good enough for the handful of genuinely
// public, no-session, no-token endpoints this app actually has. A request right at a window
// boundary can in principle let up to ~2x maxRequests through across the boundary — an accepted
// trade-off for abuse deterrence on a low-traffic endpoint, not a hard security perimeter.
//
// `key` should already identify what's being limited AND by what (e.g. `signup:${ip}`) — this
// function doesn't scope it further. Fails OPEN (returns allowed:true) on any infra error: a
// rate-limit hiccup should never itself take down the endpoint it's protecting.
export async function checkRateLimit(key: string, { maxRequests, windowSeconds }: { maxRequests: number; windowSeconds: number }): Promise<{ allowed: boolean }> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("increment_rate_limit", { p_key: key, p_window_start: windowStart });
  if (error || typeof data !== "number") return { allowed: true };
  return { allowed: data <= maxRequests };
}

// Vercel/most proxies set this to a comma-separated chain, client IP first — the rest are
// intermediate proxies. Falls back to a constant when absent (local dev, or a proxy that strips
// it) so rate limiting degrades to "everyone shares one bucket" rather than throwing.
export function clientIpFrom(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}
