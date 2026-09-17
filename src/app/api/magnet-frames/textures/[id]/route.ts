import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { removeObjects } from "@/lib/storage";
import type { MagnetFrameCustomTextureRow } from "@/lib/types";

const BUCKET = "magnet-frame-textures";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { data: texture } = await supabase
    .from("magnet_frame_custom_textures")
    .select("*")
    .eq("id", id)
    .eq("photographer_id", user.id)
    .maybeSingle<MagnetFrameCustomTextureRow>();
  if (!texture) return NextResponse.json({ error: "הטקסטורה לא נמצאה" }, { status: 404 });

  await removeObjects(BUCKET, [texture.storage_path]);
  await supabase.from("magnet_frame_custom_textures").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
