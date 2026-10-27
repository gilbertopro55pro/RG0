import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// The client's favorites reached the photo count for the album and the confetti fell (owner,
// 2026-10-27; lib/selectionTarget.ts): recorded once, so it never falls again in this gallery. Only
// on the client's own link (access_token), like every write in the client gallery: a view-only
// share link writes nothing.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();
  const { data: gallery } = await supabase
    .from("galleries")
    .select("id")
    .eq("access_token", token)
    .eq("published", true)
    .is("archived_at", null)
    .maybeSingle<{ id: string }>();
  if (!gallery) return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  await supabase
    .from("galleries")
    .update({ selection_target_celebrated_at: new Date().toISOString() })
    .eq("id", gallery.id)
    .is("selection_target_celebrated_at", null);
  return NextResponse.json({ ok: true });
}
