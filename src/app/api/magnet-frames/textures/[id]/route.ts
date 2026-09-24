import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { removeObjects } from "@/lib/storage";
import type { MagnetFrameCustomTextureRow } from "@/lib/types";

const BUCKET = "magnet-frame-textures";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const { data: texture } = await supabase
    .from("magnet_frame_custom_textures")
    .select("*")
    .eq("id", id)
    .eq("photographer_id", userId)
    .maybeSingle<MagnetFrameCustomTextureRow>();
  if (!texture) return NextResponse.json({ error: "הטקסטורה לא נמצאה" }, { status: 404 });

  await removeObjects(BUCKET, [texture.storage_path]);
  await supabase.from("magnet_frame_custom_textures").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
