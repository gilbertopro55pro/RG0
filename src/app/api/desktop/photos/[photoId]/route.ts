import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { downloadObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

// Serves a full-resolution photo's raw bytes to the separate desktop app (photographer-flow-desktop),
// which has no server of its own and can't hold R2 credentials (those are server-only secrets —
// embedding them in a distributable app would leak them to anyone who inspects the binary). Auth is
// a bearer token instead of the cookie session every other route here uses, since a native app has
// no shared cookie jar with the deployed site — the desktop app sends the Supabase access_token it
// already holds from its own signInWithPassword call, and this validates it directly against Auth.
export async function GET(request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  // Service-role, not the anon client above — getUser(token) only verifies the JWT, it doesn't
  // attach it to this client's own PostgREST requests, so a plain anon-key query here would run
  // as anonymous and get blocked by RLS regardless of the token being valid. The explicit
  // photographer_id check right below is this route's actual authorization boundary.
  const serviceRole = createServiceRoleClient();
  const { data: photo } = await serviceRole
    .from("gallery_photos")
    .select("storage_path, photographer_id")
    .eq("id", photoId)
    .maybeSingle<{ storage_path: string; photographer_id: string }>();
  if (!photo || photo.photographer_id !== user.id) {
    return NextResponse.json({ error: "התמונה לא נמצאה" }, { status: 404 });
  }

  const buffer = await downloadObjectBuffer("galleries", photo.storage_path);
  if (!buffer) {
    return NextResponse.json({ error: "שגיאה בטעינת התמונה" }, { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
