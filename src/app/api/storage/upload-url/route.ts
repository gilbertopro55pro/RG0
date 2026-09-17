import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedUploadUrl } from "@/lib/storage";
import { checkStorageQuota } from "@/lib/storageQuota";

const VALID_BUCKETS = new Set(["galleries", "album-designs", "logos"]);

// R2 credentials are secret and never reach the browser — every client-side upload goes through
// this route to mint a short-lived presigned PUT URL instead. Authorization matches the folder
// convention the storage paths were already built around (`${userId}/${galleryOrEventId}/...`):
// a caller can only request a URL for a path under their own user id prefix.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { bucket, path, contentType }: { bucket: string; path: string; contentType?: string } = await request.json();

  if (!VALID_BUCKETS.has(bucket) || !path?.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }

  const quota = await checkStorageQuota(supabase, user.id);
  if (!quota.ok) {
    return NextResponse.json({ error: quota.error }, { status: 403 });
  }

  const url = await getSignedUploadUrl(bucket, path, contentType || "application/octet-stream");
  return NextResponse.json({ url });
}
