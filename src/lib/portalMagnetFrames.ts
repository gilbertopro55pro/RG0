import type { SupabaseClient } from "@supabase/supabase-js";
import { getSignedDownloadUrls } from "@/lib/storage";
import { magnetApprovalStatus, type MagnetApprovalStatus } from "@/lib/magnetApproval";
import { DEFAULT_MAGNET_FRAME_SETTINGS } from "@/lib/magnetFrameShared";
import { magnetPortfolioSlug, type MagnetQrContext } from "@/lib/magnetQr";
import type { MagnetFrameDesignRow, MagnetFrameElement, MagnetFrameSettings } from "@/lib/types";

// The magnet frames the client sees in the portal (stage 3, owner 2026-10-22): the frames of this
// event that the photographer shared (client_shared_at), with what drawing them needs. Server-only:
// the portal page reads them with the service role after resolving the event from its token, and
// only that event's shared frames leave the server. The photographer's internal frame name stays
// out of it.

export type PortalMagnetFrame = {
  id: string;
  frameSettings: MagnetFrameSettings;
  landscapeElements: MagnetFrameElement[];
  portraitElements: MagnetFrameElement[];
  // Signed URLs of the photographer's own uploads this frame uses.
  customTextureUrl: string | null;
  customElementUrls: Record<string, string | null>;
  status: Exclude<MagnetApprovalStatus, "not_shared">;
  approvedAt: string | null;
  comment: string | null;
  commentAt: string | null;
};

// What a QR element on the frame opens (MagnetFramePreview's qrContext): this event's guest gallery
// link, or the photographer's portfolio.
export type PortalMagnetQrContext = MagnetQrContext;

const TEXTURE_BUCKET = "magnet-frame-textures";
const ELEMENT_BUCKET = "magnet-frame-elements";
// Long enough for a portal tab left open for a while; the images load once.
const SIGNED_URL_TTL_SECONDS = 6 * 3600;

// Older texts predate the bold / italic / underline fields: a missing `bold` is true, as the editor
// reads them (MagnetFrameEditor's load).
function withTextDefaults(elements: MagnetFrameElement[] | null | undefined): MagnetFrameElement[] {
  return (elements ?? []).map((el) => (el.type === "text" ? { ...el, bold: el.bold ?? true, italic: el.italic ?? false, underline: el.underline ?? false } : el));
}

type DesignPick = Pick<
  MagnetFrameDesignRow,
  "id" | "landscape_elements" | "portrait_elements" | "frame_settings" | "updated_at" | "client_shared_at" | "client_approved_at" | "client_comment" | "client_comment_at"
>;

// Never fails the portal: on any error the section just isn't shown.
export async function loadPortalMagnetFrames(
  supabase: SupabaseClient,
  event: { id: string; photographer_id: string }
): Promise<{ frames: PortalMagnetFrame[]; qrContext: PortalMagnetQrContext }> {
  try {
    return await load(supabase, event);
  } catch (e) {
    console.error("[portal] magnet frames failed", e);
    return { frames: [], qrContext: { eventId: event.id, portfolioSlug: null } };
  }
}

async function load(supabase: SupabaseClient, event: { id: string; photographer_id: string }): Promise<{ frames: PortalMagnetFrame[]; qrContext: PortalMagnetQrContext }> {
  const { data } = await supabase
    .from("magnet_frame_designs")
    .select("id, landscape_elements, portrait_elements, frame_settings, updated_at, client_shared_at, client_approved_at, client_comment, client_comment_at")
    .eq("event_id", event.id)
    .eq("photographer_id", event.photographer_id)
    .not("client_shared_at", "is", null)
    .order("created_at", { ascending: true })
    .returns<DesignPick[]>();
  const designs = (data ?? []).filter((d) => !!d.client_shared_at);
  if (designs.length === 0) return { frames: [], qrContext: { eventId: event.id, portfolioSlug: null } };

  // The uploads the shared frames use, and only the photographer's own.
  const textureIds = [...new Set(designs.map((d) => d.frame_settings?.customTextureAssetId).filter((v): v is string => !!v))];
  const elementIds = [
    ...new Set(
      designs.flatMap((d) => [...(d.landscape_elements ?? []), ...(d.portrait_elements ?? [])]).flatMap((el) => (el.type === "decoration" && el.customElementAssetId ? [el.customElementAssetId] : []))
    ),
  ];
  const [textures, elements, photographer] = await Promise.all([
    textureIds.length
      ? supabase.from("magnet_frame_custom_textures").select("id, storage_path").eq("photographer_id", event.photographer_id).in("id", textureIds).returns<{ id: string; storage_path: string }[]>()
      : Promise.resolve({ data: [] as { id: string; storage_path: string }[] }),
    elementIds.length
      ? supabase.from("magnet_frame_custom_elements").select("id, storage_path").eq("photographer_id", event.photographer_id).in("id", elementIds).returns<{ id: string; storage_path: string }[]>()
      : Promise.resolve({ data: [] as { id: string; storage_path: string }[] }),
    supabase
      .from("photographers")
      .select("portfolio_slug, portfolio_enabled")
      .eq("id", event.photographer_id)
      .maybeSingle<{ portfolio_slug: string | null; portfolio_enabled: boolean | null }>(),
  ]);
  const signAll = async (bucket: string, rows: { id: string; storage_path: string }[] | null) => {
    const list = rows ?? [];
    if (!list.length) return new Map<string, string>();
    try {
      const signed = new Map((await getSignedDownloadUrls(bucket, list.map((r) => r.storage_path), SIGNED_URL_TTL_SECONDS)).map((u) => [u.path, u.signedUrl]));
      return new Map(list.flatMap((r) => (signed.has(r.storage_path) ? [[r.id, signed.get(r.storage_path)!] as const] : [])));
    } catch {
      // A missing upload draws the frame without it, as the editor does.
      return new Map<string, string>();
    }
  };
  const [textureUrls, elementUrls] = await Promise.all([signAll(TEXTURE_BUCKET, textures.data), signAll(ELEMENT_BUCKET, elements.data)]);

  const frames = designs.map((d): PortalMagnetFrame => {
    const settings: MagnetFrameSettings = { ...DEFAULT_MAGNET_FRAME_SETTINGS, ...d.frame_settings };
    const own = new Set([...(d.landscape_elements ?? []), ...(d.portrait_elements ?? [])].flatMap((el) => (el.type === "decoration" && el.customElementAssetId ? [el.customElementAssetId] : [])));
    const status = magnetApprovalStatus(d);
    return {
      id: d.id,
      frameSettings: settings,
      landscapeElements: withTextDefaults(d.landscape_elements),
      portraitElements: withTextDefaults(d.portrait_elements),
      customTextureUrl: settings.customTextureAssetId ? (textureUrls.get(settings.customTextureAssetId) ?? null) : null,
      customElementUrls: Object.fromEntries([...own].map((id) => [id, elementUrls.get(id) ?? null])),
      status: status === "not_shared" ? "waiting" : status,
      approvedAt: d.client_approved_at,
      comment: d.client_comment,
      commentAt: d.client_comment_at,
    };
  });
  return { frames, qrContext: { eventId: event.id, portfolioSlug: photographer.data ? magnetPortfolioSlug(photographer.data) : null } };
}
