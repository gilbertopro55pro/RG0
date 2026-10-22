import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { removeObjects } from "@/lib/storage";
import type { MagnetFrameDesignRow } from "@/lib/types";

const DESIGN_SELECT = "*, event:events(id, client_name, event_date)";
type DesignWithEvent = MagnetFrameDesignRow & { event: { id: string; client_name: string; event_date: string } | null };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const { data: design } = await supabase
    .from("magnet_frame_designs")
    .select(DESIGN_SELECT)
    .eq("id", id)
    .eq("photographer_id", userId)
    .maybeSingle<DesignWithEvent>();
  if (!design) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });
  return NextResponse.json({ design });
}

// Renames the frame or links it to an event (eventId null unlinks). The elements are saved by
// POST /api/magnet-frames, so this doesn't move updated_at.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  let body: { name?: string | null; eventId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });

  const patch: { name?: string | null; event_id?: string | null } = {};
  if ("name" in body) {
    if (body.name != null && typeof body.name !== "string") return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
    patch.name = (body.name ?? "").trim().slice(0, 80).trim() || null;
  }
  if ("eventId" in body) {
    if (body.eventId != null && (typeof body.eventId !== "string" || !body.eventId)) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
    const eventId = body.eventId ?? null;
    // RLS checks the event belongs to the photographer too; this gives the clear answer.
    if (eventId) {
      const { data: event } = await supabase.from("events").select("id").eq("id", eventId).eq("photographer_id", userId).maybeSingle();
      if (!event) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
    }
    patch.event_id = eventId;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });

  const { data: design, error } = await supabase
    .from("magnet_frame_designs")
    .update(patch)
    .eq("id", id)
    .eq("photographer_id", userId)
    .select(DESIGN_SELECT)
    .maybeSingle<DesignWithEvent>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!design) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });
  return NextResponse.json({ design });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const { data: deleted, error } = await supabase
    .from("magnet_frame_designs")
    .delete()
    .eq("id", id)
    .eq("photographer_id", userId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

  // The PSD downloads of this frame (api/magnet-frames/[id]/psd keeps the last one per orientation).
  // Only after the row was the photographer's own, and only under their own prefix.
  try {
    await removeObjects("magnet-frame-exports", [`${userId}/${deleted.id}-landscape.psd`, `${userId}/${deleted.id}-portrait.psd`]);
  } catch {
    // A leftover file is harmless; the frame itself is gone.
  }
  return NextResponse.json({ ok: true });
}
