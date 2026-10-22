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
    expect(heroStageAction(stages, none, false)).toEqual({ key: "shoot_day", label: "יום הצילום", canMark: true, notifies: false });
  });

  it("lets event closing be marked by hand, like the event page", () => {
    expect(heroStageAction([row(1, false, "event_closing")], none, false)?.canMark).toBe(true);
  });

  it("hands back a client update where the stages route does", () => {
    expect(heroStageAction([row(1, false, "gallery_upload")], none, false)?.notifies).toBe(true);
    expect(heroStageAction([row(1, false, "final_delivery")], none, false)?.notifies).toBe(false);
  });

  it("holds the album stage until its PDF is on the event, and it never notifies from here", () => {
    expect(heroStageAction([row(1, false, "album_approval")], none, false)).toMatchObject({ canMark: false, notifies: false });
    expect(heroStageAction([row(1, false, "album_approval")], none, true)).toMatchObject({ canMark: true, notifies: false });
  });

  it("reads a custom package's stage, and sends its album stage to the event page", () => {
    const custom = new Map([
      ["c1", { name: "עריכת קליפ", requires_album_pdf: false, notify_client: true }],
      ["c2", { name: "עיצוב אלבום", requires_album_pdf: true, notify_client: true }],
    ]);
    expect(heroStageAction([row(1, true, "event_closing"), row(2, false, null, "c1")], custom, false)).toEqual({
      key: "custom:c1",
      label: "עריכת קליפ",
      canMark: true,
      notifies: true,
    });
    expect(heroStageAction([row(1, false, null, "c2")], custom, true)?.canMark).toBe(false);
  });

  it("is nothing when every stage is done or the stage is unknown", () => {
    expect(heroStageAction([row(1, true, "event_closing")], none, false)).toBeNull();
    expect(heroStageAction([row(1, false, null, "gone")], none, false)).toBeNull();
    expect(heroStageAction([], none, false)).toBeNull();
  });
});

describe("stageKeyBody", () => {
  it("splits a built-in key from a custom one", () => {
    expect(stageKeyBody("gallery_upload")).toEqual({ stageKey: "gallery_upload", customStageId: null });
    expect(stageKeyBody("custom:abc")).toEqual({ stageKey: null, customStageId: "abc" });
  });
});
