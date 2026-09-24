import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { removeObjects } from "@/lib/storage";
import type { MagnetFrameCustomElementRow } from "@/lib/types";

const BUCKET = "magnet-frame-elements";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const { data: element } = await supabase
    .from("magnet_frame_custom_elements")
    .select("*")
    .eq("id", id)
    .eq("photographer_id", userId)
    .maybeSingle<MagnetFrameCustomElementRow>();
  if (!element) return NextResponse.json({ error: "האלמנט לא נמצא" }, { status: 404 });

  await removeObjects(BUCKET, [element.storage_path]);
  await supabase.from("magnet_frame_custom_elements").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
