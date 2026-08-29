import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";

export const runtime = "nodejs";

// Powers the gallery picker in the separate desktop app's upload screen — a plain list, no
// photos, so it stays fast regardless of how many galleries or photos a photographer has.
export async function GET(request: Request) {
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const serviceRole = createServiceRoleClient();
  const { data: galleries, error } = await serviceRole
    .from("galleries")
    .select("id, title, shoot_date, created_at")
    .eq("photographer_id", auth.userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<{ id: string; title: string; shoot_date: string | null; created_at: string }[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ galleries: galleries ?? [] });
}
