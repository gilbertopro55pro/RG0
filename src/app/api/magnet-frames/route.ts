import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { DEFAULT_MAGNET_FRAME_SETTINGS } from "@/lib/magnetFrameShared";
import type { MagnetFrameDesignRow, MagnetFrameElement, MagnetFrameSettings } from "@/lib/types";

export async function GET() {
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const { data: designs } = await supabase
    .from("magnet_frame_designs")
    .select("*")
    .eq("photographer_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .returns<MagnetFrameDesignRow[]>();

  return NextResponse.json({ design: designs?.[0] ?? null });
}

// Saves both frames. Since the two-step editor (2026-10-06) the portrait frame has its own positions
// (step 2 starts from the landscape layout fitted to the portrait frame, then the photographer
// adjusts), so the editor sends portraitElements. A client without it falls back to a copy of the
// landscape elements, the old behavior.
export async function POST(request: Request) {
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const {
    id,
    eventId,
    elements,
    portraitElements: sentPortrait,
    frameSettings,
  }: { id?: string; eventId?: string | null; elements: MagnetFrameElement[]; portraitElements?: MagnetFrameElement[]; frameSettings?: MagnetFrameSettings } = await request.json();
  if (!Array.isArray(elements)) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });

  const portraitElements = Array.isArray(sentPortrait) ? sentPortrait : (JSON.parse(JSON.stringify(elements)) as MagnetFrameElement[]);
  const settings = frameSettings ?? DEFAULT_MAGNET_FRAME_SETTINGS;

  if (id) {
    const { data: updated, error } = await supabase
      .from("magnet_frame_designs")
      .update({ landscape_elements: elements, portrait_elements: portraitElements, frame_settings: settings, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("photographer_id", userId)
      .select()
      .single<MagnetFrameDesignRow>();
    if (error || !updated) return NextResponse.json({ error: error?.message ?? "שגיאה בשמירה" }, { status: 500 });
    return NextResponse.json({ design: updated });
  }

  const { data: created, error } = await supabase
    .from("magnet_frame_designs")
    .insert({ photographer_id: userId, event_id: eventId ?? null, landscape_elements: elements, portrait_elements: portraitElements, frame_settings: settings })
    .select()
    .single<MagnetFrameDesignRow>();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "שגיאה בשמירה" }, { status: 500 });
  return NextResponse.json({ design: created });
}
