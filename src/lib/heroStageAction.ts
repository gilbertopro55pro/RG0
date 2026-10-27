import { STAGE_LABELS, STAGE_NOTIFY_CLIENT, type StageKey } from "@/lib/stages";
import { stageMarkNotifies } from "@/lib/albumStageMark";

// The stage button on the home screen's next-shoot card (owner, 2026-10-22: mark the current stage
// and move on without opening the event). The same rules as the event page's own "סימון כבוצע":
// any current stage can be marked by hand, event closing included (owner, 2026-10-05), and an
// album stage without its design PDF too (owner, 2026-10-27). `notifies`: marking it hands back a
// client update to send (api/events/[id]/stages), exactly when that route does. The card never
// sends a PDF, so an album stage marked from it never notifies (lib/albumStageMark.ts).

export type HeroStageAction = {
  key: string; // "gallery_upload" or "custom:<id>", as the event page keys stages
  label: string;
  notifies: boolean;
};

type StageRow = { done: boolean; stage_key: string | null; custom_stage_id: string | null; stage_order: number };
type CustomStage = { name: string; requires_album_pdf: boolean; notify_client: boolean };

export function heroStageAction(
  stages: readonly StageRow[],
  customStages: ReadonlyMap<string, CustomStage>
): HeroStageAction | null {
  const current = [...stages].sort((a, b) => a.stage_order - b.stage_order).find((s) => !s.done);
  if (!current) return null;
  if (current.stage_key) {
    const key = current.stage_key as StageKey;
    const label = STAGE_LABELS[key];
    if (!label) return null;
    const album = key === "album_approval";
    return {
      key,
      label,
      notifies: stageMarkNotifies({ done: true, hasNotifyText: !!STAGE_NOTIFY_CLIENT[key], requiresAlbumPdf: album, hasPdfInRequest: false, isStandardAlbumApproval: album }),
    };
  }
  const custom = customStages.get(current.custom_stage_id ?? "");
  if (!custom) return null;
  return {
    key: `custom:${current.custom_stage_id}`,
    label: custom.name,
    notifies: stageMarkNotifies({
      done: true,
      hasNotifyText: custom.notify_client,
      requiresAlbumPdf: custom.requires_album_pdf,
      hasPdfInRequest: false,
      isStandardAlbumApproval: false,
    }),
  };
}

// The body for api/events/[id]/stages from a stage key.
export function stageKeyBody(key: string): { stageKey: string | null; customStageId: string | null } {
  return key.startsWith("custom:") ? { stageKey: null, customStageId: key.slice(7) } : { stageKey: key, customStageId: null };
}
