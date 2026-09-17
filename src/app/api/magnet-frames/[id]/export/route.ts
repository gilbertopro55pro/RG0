import sharp from "sharp";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { renderMagnetFrameBase, composeMagnetFrameElements, composeMagnetFrameTexture } from "@/lib/magnetFrame";
import { DEFAULT_MAGNET_FRAME_SETTINGS } from "@/lib/magnetFrameShared";
import { downloadObjectBuffer } from "@/lib/storage";
import type { FrameOrientation, MagnetFrameCustomElementRow, MagnetFrameCustomTextureRow, MagnetFrameDesignRow } from "@/lib/types";

// Renders on demand rather than persisting to storage like frame_requests does — composition here
// is cheap/deterministic (no AI call), so there's nothing worth caching, and every export always
// reflects whatever was last saved.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const orientation = (new URL(request.url).searchParams.get("orientation") ?? "landscape") as FrameOrientation;
  if (orientation !== "landscape" && orientation !== "portrait") {
    return NextResponse.json({ error: "כיוון לא תקין" }, { status: 400 });
  }

  const { data: design } = await supabase
    .from("magnet_frame_designs")
    .select("*")
    .eq("id", id)
    .eq("photographer_id", user.id)
    .maybeSingle<MagnetFrameDesignRow>();
  if (!design) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

  const elements = orientation === "landscape" ? design.landscape_elements : design.portrait_elements;
  const settings = { ...DEFAULT_MAGNET_FRAME_SETTINGS, ...design.frame_settings };

  let customTextureImage: Buffer | null = null;
  if (settings.customTextureAssetId) {
    const { data: texture } = await supabase
      .from("magnet_frame_custom_textures")
      .select("*")
      .eq("id", settings.customTextureAssetId)
      .eq("photographer_id", user.id)
      .maybeSingle<MagnetFrameCustomTextureRow>();
    if (texture) customTextureImage = await downloadObjectBuffer("magnet-frame-textures", texture.storage_path);
  }

  const customElementAssetIds = elements.filter((el): el is Extract<typeof el, { type: "decoration" }> => el.type === "decoration" && !!el.customElementAssetId).map((el) => el.customElementAssetId!);
  const customElementBuffers = new Map<string, Buffer>();
  if (customElementAssetIds.length > 0) {
    const { data: customElements } = await supabase
      .from("magnet_frame_custom_elements")
      .select("*")
      .eq("photographer_id", user.id)
      .in("id", customElementAssetIds)
      .returns<MagnetFrameCustomElementRow[]>();
    for (const ce of customElements ?? []) {
      const buf = await downloadObjectBuffer("magnet-frame-elements", ce.storage_path);
      if (buf) customElementBuffers.set(ce.id, buf);
    }
  }

  let base = await renderMagnetFrameBase(orientation, settings);
  base = await composeMagnetFrameTexture(base, settings, orientation, customTextureImage);
  const elementsLayer = await composeMagnetFrameElements(elements, orientation, customElementBuffers);
  const composed = await sharp(base).composite([{ input: elementsLayer, left: 0, top: 0 }]).png().toBuffer();
  return new NextResponse(new Uint8Array(composed), { headers: { "Content-Type": "image/png" } });
}
