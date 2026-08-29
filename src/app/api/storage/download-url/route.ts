import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedDownloadUrl } from "@/lib/storage";

const VALID_BUCKETS = new Set(["galleries", "album-designs", "logos"]);

// Same ownership model as upload-url: the caller may only request a signed download link for a
// path under their own user id prefix.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { bucket, path, filename }: { bucket: string; path: string; filename?: string } = await request.json();

  if (!VALID_BUCKETS.has(bucket) || !path?.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }

  const url = await getSignedDownloadUrl(bucket, path, 300, filename);
  return NextResponse.json({ url });
}
