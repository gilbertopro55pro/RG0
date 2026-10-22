import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { removeObjects } from "@/lib/storage";
import { CLEARED_CLIENT_APPROVAL, shareWithClientPatch, type MagnetApprovalFields } from "@/lib/magnetApproval";
import type { MagnetFrameDesignRow } from "@/lib/types";

const DESIGN_SELECT = "*, event:events(id, client_name, event_date)";
type DesignWithEvent = MagnetFrameDesignRow & { event: { id: string; client_name: string; event_date: string } | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;
  if (!UUID.test(id)) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

  const { data: design } = await supabase
    .from("magnet_frame_designs")
    .select(DESIGN_SELECT)
    .eq("id", id)
    .eq("photographer_id", userId)
    .maybeSingle<DesignWithEvent>();
  if (!design) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });
  return NextResponse.json({ design });
}

// Renames the frame, links it to an event (eventId null unlinks), or shares it with the event's
// client in the portal (shareWithClient, stage 3: true when the photographer sends the link, false
// stops it). The elements are saved by POST /api/magnet-frames, so this doesn't move updated_at.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;
  if (!UUID.test(id)) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

  let body: { name?: string | null; eventId?: string | null; shareWithClient?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    if (body.name != null && typeof body.name !== "string") return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
    patch.name = (body.name ?? "").trim().slice(0, 80).trim() || null;
  }
  const hasEvent = "eventId" in body;
  const hasShare = "shareWithClient" in body;
  if (hasShare && typeof body.shareWithClient !== "boolean") return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  if (hasEvent) {
    if (body.eventId != null && (typeof body.eventId !== "string" || !UUID.test(body.eventId))) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
    const eventId = body.eventId ?? null;
    // RLS checks the event belongs to the photographer too; this gives the clear answer.
    if (eventId) {
      const { data: event } = await supabase.from("events").select("id").eq("id", eventId).eq("photographer_id", userId).maybeSingle();
      if (!event) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
    }
    patch.event_id = eventId;
  }
  if (Object.keys(patch).length === 0 && !hasShare) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });

  // The client approval columns depend on the row as it is: a frame that moves to another event
  // (or leaves its event) isn't shared with anyone any more, and a share needs an event.
  if (hasEvent || hasShare) {
    const { data: current } = await supabase
      .from("magnet_frame_designs")
      .select("event_id, updated_at, client_shared_at, client_approved_at, client_comment, client_comment_at")
      .eq("id", id)
      .eq("photographer_id", userId)
      .maybeSingle<MagnetApprovalFields & { event_id: string | null }>();
    if (!current) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });
    let approval: MagnetApprovalFields = current;
    if (hasEvent && patch.event_id !== current.event_id) {
      Object.assign(patch, CLEARED_CLIENT_APPROVAL);
      approval = { ...current, ...CLEARED_CLIENT_APPROVAL };
    }
    if (hasShare) {
      const eventId = hasEvent ? (patch.event_id as string | null) : current.event_id;
      if (body.shareWithClient) {
        if (!eventId) return NextResponse.json({ error: "המסגרת לא משויכת לאירוע" }, { status: 400 });
        Object.assign(patch, shareWithClientPatch(approval, new Date().toISOString()));
      } else {
        patch.client_shared_at = null;
      }
    }
  }

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
  if (!UUID.test(id)) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

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
