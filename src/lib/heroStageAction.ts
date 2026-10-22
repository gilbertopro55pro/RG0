import { STAGE_LABELS, STAGE_NOTIFY_CLIENT, type StageKey } from "@/lib/stages";

// The stage button on the home screen's next-shoot card (owner, 2026-10-22: mark the current stage
// and move on without opening the event). The same rules as the event page's own "סימון כבוצע":
// any current stage can be marked by hand, event closing included (owner, 2026-10-05), except one
// that needs the album design PDF first. The standard album stage can once its PDF is on the
// event; a custom package's album stage uploads and completes in one step on the event page, so the
// card sends the photographer there. `notifies`: marking it hands back a client update to send
// (api/events/[id]/stages), exactly when that route does.

export type HeroStageAction = {
  key: string; // "gallery_upload" or "custom:<id>", as the event page keys stages
  label: string;
  canMark: boolean;
  notifies: boolean;
};

type StageRow = { done: boolean; stage_key: string | null; custom_stage_id: string | null; stage_order: number };
type CustomStage = { name: string; requires_album_pdf: boolean; notify_client: boolean };

export function heroStageAction(
  stages: readonly StageRow[],
  customStages: ReadonlyMap<string, CustomStage>,
  hasAlbumPdf: boolean
): HeroStageAction | null {
  const current = [...stages].sort((a, b) => a.stage_order - b.stage_order).find((s) => !s.done);
  if (!current) return null;
  if (current.stage_key) {
    const key = current.stage_key as StageKey;
    const label = STAGE_LABELS[key];
    if (!label) return null;
    return {
      key,
      label,
      canMark: key !== "album_approval" || hasAlbumPdf,
      notifies: !!STAGE_NOTIFY_CLIENT[key] && key !== "album_approval",
    };
  }
  const custom = customStages.get(current.custom_stage_id ?? "");
  if (!custom) return null;
  return {
    key: `custom:${current.custom_stage_id}`,
    label: custom.name,
    canMark: !custom.requires_album_pdf,
    notifies: custom.notify_client,
  };
}

// The body for api/events/[id]/stages from a stage key.
export function stageKeyBody(key: string): { stageKey: string | null; customStageId: string | null } {
  return key.startsWith("custom:") ? { stageKey: null, customStageId: key.slice(7) } : { stageKey: key, customStageId: null };
}
