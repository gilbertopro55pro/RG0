import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedUploadUrl } from "@/lib/storage";
import { checkStorageQuota } from "@/lib/storageQuota";

const VALID_BUCKETS = new Set(["galleries", "album-designs", "logos"]);
const MAX_ITEMS = 50;

// The batch version of /api/storage/upload-url, for gallery uploads (owner, 2026-10-07: "can my
// uploads be that fast too?"). Asking for one URL before every photo cost a round trip, an auth
// check and a storage-quota query per file; the uploader now asks for the next few dozen at once,
// so the connection keeps transferring photos instead of waiting between them. Same rules as the
// single route: every path must sit under the caller's own user id, and the quota is checked
// (once per batch).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { bucket, items }: { bucket: string; items: { path: string; contentType?: string }[] } = await request.json();
  if (!VALID_BUCKETS.has(bucket) || !Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS || items.some((it) => !it?.path?.startsWith(`${user.id}/`))) {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }

  const quota = await checkStorageQuota(supabase, user.id);
  if (!quota.ok) {
    return NextResponse.json({ error: quota.error }, { status: 403 });
  }

  // Valid long enough for the whole batch to start uploading on a slow connection.
  const urls = await Promise.all(items.map((it) => getSignedUploadUrl(bucket, it.path, it.contentType || "application/octet-stream", 1800)));
  return NextResponse.json({ urls });
}
