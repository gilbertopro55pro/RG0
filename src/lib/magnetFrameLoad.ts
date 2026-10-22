import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MAGNET_FRAME_SETTINGS, isSquareMagnetSize } from "@/lib/magnetFrameShared";
import { downloadObjectBuffer } from "@/lib/storage";
import type { FrameOrientation, MagnetFrameCustomElementRow, MagnetFrameCustomTextureRow, MagnetFrameDesignRow, MagnetFrameElement, MagnetFrameSettings } from "@/lib/types";

export type LoadedMagnetDesign = {
  // The orientation the elements are for: the one asked for, or landscape for a square size,
  // which has a single frame.
  orientation: FrameOrientation;
  elements: MagnetFrameElement[];
  settings: MagnetFrameSettings;
  customTextureImage: Buffer | null;
  customElementBuffers: Map<string, Buffer>;
};

// Everything one orientation of a saved design needs to render (PNG or PSD): its elements, the
// merged settings, and the photographer's own uploaded texture/elements fetched from storage.
// Null when the design isn't this photographer's. The print size is settings.sizeKey (missing =
// 20×15); a square size returns its one (landscape) frame for either orientation.
export async function loadMagnetDesign(supabase: SupabaseClient, userId: string, id: string, orientation: FrameOrientation): Promise<LoadedMagnetDesign | null> {
  const { data: design } = await supabase
    .from("magnet_frame_designs")
    .select("*")
    .eq("id", id)
    .eq("photographer_id", userId)
    .maybeSingle<MagnetFrameDesignRow>();
  if (!design) return null;

  // Designs saved before sizes have no sizeKey in frame_settings and get the default, 20×15.
  const settings: MagnetFrameSettings = { ...DEFAULT_MAGNET_FRAME_SETTINGS, ...design.frame_settings };
  const rendered: FrameOrientation = isSquareMagnetSize(settings.sizeKey) ? "landscape" : orientation;
  const elements = (rendered === "landscape" ? design.landscape_elements : design.portrait_elements) ?? [];

  let customTextureImage: Buffer | null = null;
  if (settings.customTextureAssetId) {
    const { data: texture } = await supabase
      .from("magnet_frame_custom_textures")
      .select("*")
      .eq("id", settings.customTextureAssetId)
      .eq("photographer_id", userId)
      .maybeSingle<MagnetFrameCustomTextureRow>();
    if (texture) customTextureImage = await downloadObjectBuffer("magnet-frame-textures", texture.storage_path);
  }

  const customElementAssetIds = elements
    .filter((el): el is Extract<typeof el, { type: "decoration" }> => el.type === "decoration" && !!el.customElementAssetId)
    .map((el) => el.customElementAssetId!);
  const customElementBuffers = new Map<string, Buffer>();
  if (customElementAssetIds.length > 0) {
    const { data: customElements } = await supabase
      .from("magnet_frame_custom_elements")
      .select("*")
      .eq("photographer_id", userId)
      .in("id", customElementAssetIds)
      .returns<MagnetFrameCustomElementRow[]>();
    for (const ce of customElements ?? []) {
      const buf = await downloadObjectBuffer("magnet-frame-elements", ce.storage_path);
      if (buf) customElementBuffers.set(ce.id, buf);
    }
  }

  return { orientation: rendered, elements, settings, customTextureImage, customElementBuffers };
}
