import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { removeObjects } from "@/lib/storage";

const VALID_BUCKETS = new Set(["galleries", "album-designs"]);

// Same ownership model as upload-url/download-url: every path must sit under the caller's own
// user id prefix, so a photographer can only ever delete their own objects.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { bucket, paths }: { bucket: string; paths: string[] } = await request.json();

  if (!VALID_BUCKETS.has(bucket) || !Array.isArray(paths) || paths.some((p) => !p.startsWith(`${user.id}/`))) {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }

  await removeObjects(bucket, paths);
  return NextResponse.json({ ok: true });
}
