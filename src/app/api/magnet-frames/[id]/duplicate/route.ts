import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { getT } from "@/i18n/server";
import type { MagnetFrameDesignRow } from "@/lib/types";

const DESIGN_SELECT = "*, event:events(id, client_name, event_date)";
type DesignWithEvent = MagnetFrameDesignRow & { event: { id: string; client_name: string; event_date: string } | null };

// A copy of a frame, for the same event: "<name> (עותק)" in the photographer's language.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const { data: source } = await supabase
    .from("magnet_frame_designs")
    .select("*")
    .eq("id", id)
    .eq("photographer_id", userId)
    .maybeSingle<MagnetFrameDesignRow>();
  if (!source) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

  const t = await getT();
  const name = t("{name} (עותק)", { name: source.name?.trim() || t("מסגרת") }).slice(0, 80);
  const { data: created, error } = await supabase
    .from("magnet_frame_designs")
    .insert({
      photographer_id: userId,
      name,
      event_id: source.event_id,
      landscape_elements: source.landscape_elements,
      portrait_elements: source.portrait_elements,
      frame_settings: source.frame_settings,
    })
    .select(DESIGN_SELECT)
    .single<DesignWithEvent>();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "שגיאה בשמירה" }, { status: 500 });
  return NextResponse.json({ design: created });
}
