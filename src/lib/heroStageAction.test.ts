import { describe, expect, it } from "vitest";
import { heroStageAction, stageKeyBody } from "@/lib/heroStageAction";

// The next-shoot card's stage button (owner, 2026-10-22): the event page's rules for "סימון כבוצע".
const row = (stage_order: number, done: boolean, stage_key: string | null, custom_stage_id: string | null = null) => ({
  stage_order,
  done,
  stage_key,
  custom_stage_id,
});
const none = new Map();

describe("heroStageAction", () => {
  it("is the first open stage by order, even when the rows come unsorted", () => {
    const stages = [row(3, false, "gallery_upload"), row(1, true, "event_closing"), row(2, false, "shoot_day")];
    expect(heroStageAction(stages, none)).toEqual({ key: "shoot_day", label: "יום הצילום", notifies: false });
  });

  it("hands back a client update where the stages route does", () => {
    expect(heroStageAction([row(1, false, "gallery_upload")], none)?.notifies).toBe(true);
    expect(heroStageAction([row(1, false, "final_delivery")], none)?.notifies).toBe(false);
  });

  it("marks the album stage without its PDF, and it never notifies from here", () => {
    expect(heroStageAction([row(1, false, "album_approval")], none)).toEqual({ key: "album_approval", label: "אישור עיצוב אלבום", notifies: false });
  });

  it("reads a custom package's stage; its album stage is marked without a file and without an update", () => {
    const custom = new Map([
      ["c1", { name: "עריכת קליפ", requires_album_pdf: false, notify_client: true }],
      ["c2", { name: "עיצוב אלבום", requires_album_pdf: true, notify_client: true }],
    ]);
    expect(heroStageAction([row(1, true, "event_closing"), row(2, false, null, "c1")], custom)).toEqual({
      key: "custom:c1",
      label: "עריכת קליפ",
      notifies: true,
    });
    expect(heroStageAction([row(1, false, null, "c2")], custom)).toEqual({ key: "custom:c2", label: "עיצוב אלבום", notifies: false });
  });

  it("is nothing when every stage is done or the stage is unknown", () => {
    expect(heroStageAction([row(1, true, "event_closing")], none)).toBeNull();
    expect(heroStageAction([row(1, false, null, "gone")], none)).toBeNull();
    expect(heroStageAction([], none)).toBeNull();
  });
});

describe("stageKeyBody", () => {
  it("splits a built-in key from a custom one", () => {
    expect(stageKeyBody("gallery_upload")).toEqual({ stageKey: "gallery_upload", customStageId: null });
    expect(stageKeyBody("custom:abc")).toEqual({ stageKey: null, customStageId: "abc" });
  });
});
