import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const serviceRole = createServiceRoleClient();
  const { data: tabs } = await serviceRole
    .from("custom_ornament_tabs")
    .select("id, name, sort_order, created_at")
    .eq("photographer_id", auth.userId)
    .order("sort_order", { ascending: true })
    .returns<{ id: string; name: string; sort_order: number; created_at: string }[]>();

  const { data: ornaments } = await serviceRole
    .from("custom_ornaments")
    .select("id, tab_id, original_filename, created_at")
    .eq("photographer_id", auth.userId)
    .returns<{ id: string; tab_id: string; original_filename: string; created_at: string }[]>();

  return NextResponse.json({ tabs: tabs ?? [], ornaments: ornaments ?? [] });
}

export async function POST(request: Request) {
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const body: { name?: string } = await request.json().catch(() => ({}));
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "יש להזין שם ללשונית" }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();
  const { count } = await serviceRole
    .from("custom_ornament_tabs")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", auth.userId);

  const { data: tab, error } = await serviceRole
    .from("custom_ornament_tabs")
    .insert({ photographer_id: auth.userId, name, sort_order: count ?? 0 })
    .select("id, name, sort_order, created_at")
    .single();
  if (error || !tab) {
    return NextResponse.json({ error: "שגיאה ביצירת הלשונית" }, { status: 500 });
  }
  return NextResponse.json({ tab });
}
