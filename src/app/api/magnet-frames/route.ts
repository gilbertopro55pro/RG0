import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { DEFAULT_MAGNET_FRAME_SETTINGS } from "@/lib/magnetFrameShared";
import type { MagnetFrameDesignRow, MagnetFrameElement, MagnetFrameSettings } from "@/lib/types";

// Several frames per photographer since 2026-10-22, each with an optional name and event. Every
// response carries the linked event, so the list can show it without a second query.
const DESIGN_SELECT = "*, event:events(id, client_name, event_date)";
type DesignWithEvent = MagnetFrameDesignRow & { event: { id: string; client_name: string; event_date: string } | null };

// The frame's name as stored: trimmed, at most 80 characters, empty = no name.
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().slice(0, 80).trim();
  return name || null;
}

export async function GET() {
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const { data: designs, error } = await supabase
    .from("magnet_frame_designs")
    .select(DESIGN_SELECT)
    .eq("photographer_id", userId)
    .order("updated_at", { ascending: false })
    .returns<DesignWithEvent[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ designs: designs ?? [] });
}

// With `id`: the editor's save (both frames and the settings; the name and the event only when the
// body has those keys). Without: a new frame. Since the two-step editor (2026-10-06) the portrait
// frame has its own positions, so the editor sends portraitElements; without it the portrait
// frame starts as a copy of the landscape one.
export async function POST(request: Request) {
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  let body: {
    id?: string;
    name?: string | null;
    eventId?: string | null;
    elements?: MagnetFrameElement[];
    portraitElements?: MagnetFrameElement[];
    frameSettings?: MagnetFrameSettings;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  const { id, elements, portraitElements: sentPortrait, frameSettings } = body;
  if (!Array.isArray(elements)) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });

  const hasName = "name" in body;
  const hasEvent = "eventId" in body;
  const eventId = typeof body.eventId === "string" && body.eventId ? body.eventId : null;
  if (hasEvent && body.eventId != null && !eventId) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  // RLS checks the event belongs to the photographer too; this gives the clear answer.
  if (eventId) {
    const { data: event } = await supabase.from("events").select("id").eq("id", eventId).eq("photographer_id", userId).maybeSingle();
    if (!event) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
  }

  const portraitElements = Array.isArray(sentPortrait) ? sentPortrait : (JSON.parse(JSON.stringify(elements)) as MagnetFrameElement[]);
  const settings = frameSettings ?? DEFAULT_MAGNET_FRAME_SETTINGS;

  if (id) {
    const patch: Record<string, unknown> = {
      landscape_elements: elements,
      portrait_elements: portraitElements,
      frame_settings: settings,
      updated_at: new Date().toISOString(),
    };
    if (hasName) patch.name = cleanName(body.name);
    if (hasEvent) patch.event_id = eventId;
    const { data: updated, error } = await supabase
      .from("magnet_frame_designs")
      .update(patch)
      .eq("id", id)
      .eq("photographer_id", userId)
      .select(DESIGN_SELECT)
      .maybeSingle<DesignWithEvent>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });
    return NextResponse.json({ design: updated });
  }

  const { data: created, error } = await supabase
    .from("magnet_frame_designs")
    .insert({
      photographer_id: userId,
      name: cleanName(body.name),
      event_id: eventId,
      landscape_elements: elements,
      portrait_elements: portraitElements,
      frame_settings: settings,
    })
    .select(DESIGN_SELECT)
    .single<DesignWithEvent>();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "שגיאה בשמירה" }, { status: 500 });
  return NextResponse.json({ design: created });
}
