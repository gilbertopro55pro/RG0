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

// Always saves the FULL current landscape canvas and derives the portrait one from it — xPct/yPct
// (of each canvas's own dimensions) and sizePct (of the shorter side) already carry over as-is
// between the two aspect ratios, so "same text and elements as the width frame" is a plain deep
// clone, not a re-layout (see MagnetFrameEditor.tsx).
export async function POST(request: Request) {
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const {
    id,
    eventId,
    elements,
    frameSettings,
  }: { id?: string; eventId?: string | null; elements: MagnetFrameElement[]; frameSettings?: MagnetFrameSettings } = await request.json();
  if (!Array.isArray(elements)) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });

  const portraitElements = JSON.parse(JSON.stringify(elements)) as MagnetFrameElement[];
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
