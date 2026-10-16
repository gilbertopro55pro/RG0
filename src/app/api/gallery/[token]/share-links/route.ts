import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";
import { narrowScope, resolveGalleryToken } from "@/lib/galleryAccess";
import { shortClientUrl } from "@/lib/shortLinks";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 5000;

// "Share my gallery" in the client's gallery: makes a read-only link (lib/galleryAccess.ts) for the
// whole gallery, some tabs, or exact photos, at full or web quality. From a share link it can only
// narrow what that link already covers.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { allowed } = await checkRateLimit(`gallery-share:${clientIpFrom(request)}`, { maxRequests: 60, windowSeconds: 3600 });
  if (!allowed) return NextResponse.json({ error: "יותר מדי בקשות. נסו שוב מאוחר יותר" }, { status: 429 });

  const supabase = createServiceRoleClient();
  const access = await resolveGalleryToken(supabase, token);
  if (!access || !access.gallery.published || access.gallery.archived_at) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  const body: { folders?: unknown; photos?: unknown; quality?: unknown } = await request.json().catch(() => ({}));
  const folderKeys = Array.isArray(body.folders) ? body.folders.filter((k): k is string => typeof k === "string").slice(0, MAX_IDS) : null;
  const photoIds = Array.isArray(body.photos) ? body.photos.filter((k): k is string => typeof k === "string" && UUID_RE.test(k)).slice(0, MAX_IDS) : null;
  const scope = narrowScope(access.scope, {
    folderKeys: folderKeys && folderKeys.length ? folderKeys : null,
    photoIds: photoIds && photoIds.length ? photoIds : null,
    quality: body.quality === "web" ? "web" : "full",
  });

  const { data: link, error } = await supabase
    .from("gallery_share_links")
    .insert({ gallery_id: access.gallery.id, folder_keys: scope.folderKeys, photo_ids: scope.photoIds, quality: scope.quality })
    .select("token")
    .single<{ token: string }>();
  if (error || !link) return NextResponse.json({ error: "יצירת הקישור נכשלה" }, { status: 500 });

  return NextResponse.json({ token: link.token, url: shortClientUrl(new URL(request.url).origin, "gallery", link.token) });
}
