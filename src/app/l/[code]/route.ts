import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSignedDownloadUrl } from "@/lib/storage";
import { SHORT_FILE_CODE_RE } from "@/lib/shortFileLinks";
import { SITE_URL } from "@/lib/siteUrl";

// A short link to a file or a page (lib/shortFileLinks.ts): myframeflow.com/l/<code> → a fresh signed
// URL for the file (an hour, enough to download it), or the stored page. Expired: 410.

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const text = (body: string, status: number) =>
  new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE } });

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!SHORT_FILE_CODE_RE.test(code)) return text("הקישור לא נמצא · Link not found", 404);
  const { data: link } = await createServiceRoleClient()
    .from("short_links")
    .select("bucket, path, filename, target, expires_at")
    .eq("code", code)
    .maybeSingle<{ bucket: string | null; path: string | null; filename: string | null; target: string | null; expires_at: string }>();
  if (!link) return text("הקישור לא נמצא · Link not found", 404);
  if (new Date(link.expires_at).getTime() < Date.now()) return text("תוקף הקישור פג. אפשר לבקש קישור חדש · This link has expired", 410);

  if (link.target) {
    // Only a path on this site (the table's own check too): never an open redirect.
    if (!link.target.startsWith("/") || link.target.startsWith("//")) return text("הקישור לא נמצא · Link not found", 404);
    return NextResponse.redirect(new URL(link.target, SITE_URL), { status: 307, headers: NO_STORE });
  }
  try {
    const url = await getSignedDownloadUrl(link.bucket!, link.path!, 60 * 60, link.filename ?? undefined);
    return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
  } catch (e) {
    console.error("[l/code] signing failed", e);
    return text("הקובץ לא זמין כרגע, נסו שוב בעוד רגע · The file isn't available right now", 503);
  }
}
