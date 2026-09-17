import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { removeObjects } from "@/lib/storage";
import type { MagnetFrameCustomElementRow } from "@/lib/types";

const BUCKET = "magnet-frame-elements";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { data: element } = await supabase
    .from("magnet_frame_custom_elements")
    .select("*")
    .eq("id", id)
    .eq("photographer_id", user.id)
    .maybeSingle<MagnetFrameCustomElementRow>();
  if (!element) return NextResponse.json({ error: "האלמנט לא נמצא" }, { status: 404 });

  await removeObjects(BUCKET, [element.storage_path]);
  await supabase.from("magnet_frame_custom_elements").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
