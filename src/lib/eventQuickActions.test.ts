import { describe, expect, it } from "vitest";
import {
  eventsLayoutCookie,
  fullPaymentPatch,
  parseEventsLayout,
  partialPaymentPatch,
  photoSelectionStageOf,
  quickReminderBlock,
  quickReminderLogText,
  receiptLegs,
  unpaidPatch,
} from "@/lib/eventQuickActions";

// Quick actions on an event from the home screen (owner, 2026-10-26).

const NOW = "2026-10-26T10:00:00.000Z";
const payment = (over: Record<string, unknown> = {}) => ({
  deposit_amount: 1000,
  deposit_paid: false,
  deposit_paid_amount: null,
  deposit_documented_amount: null,
  deposit_document_url: null,
  balance_amount: 4000,
  balance_paid: false,
  balance_paid_amount: null,
  balance_documented_amount: null,
  balance_document_url: null,
  ...over,
});

describe("receiptLegs: only what was marked as paid, without a receipt yet", () => {
  it("nothing marked: no receipt", () => {
    expect(receiptLegs(payment())).toEqual([]);
    expect(receiptLegs(null)).toEqual([]);
  });

  it("a full deposit and a partial balance", () => {
    expect(receiptLegs(payment({ deposit_paid: true, balance_paid_amount: 1500 }))).toEqual([
      { field: "deposit", amount: 1000 },
      { field: "balance", amount: 1500 },
    ]);
  });

  it("only the part an earlier receipt didn't cover", () => {
    expect(receiptLegs(payment({ balance_paid_amount: 2500, balance_documented_amount: 1500, balance_document_url: "x" }))).toEqual([
      { field: "balance", amount: 1000 },
    ]);
  });

  it("a receipt from before amounts were tracked covered the whole leg", () => {
    expect(receiptLegs(payment({ deposit_paid: true, deposit_document_url: "x" }))).toEqual([]);
  });
});

describe("payment patches, the same the event page writes", () => {
  it("full", () => {
    expect(fullPaymentPatch("deposit", NOW)).toEqual({ deposit_paid: true, deposit_paid_at: NOW, deposit_paid_amount: null });
  });

  it("partial keeps the leg unpaid and records when the money came", () => {
    expect(partialPaymentPatch("balance", 1200.456, 4000, NOW)).toEqual({ balance_paid: false, balance_paid_at: NOW, balance_paid_amount: 1200.46 });
  });

  it("a partial amount that reaches the whole leg is the full payment", () => {
    expect(partialPaymentPatch("balance", 4000, 4000, NOW)).toEqual(fullPaymentPatch("balance", NOW));
    expect(partialPaymentPatch("balance", 5000, 4000, NOW)).toEqual(fullPaymentPatch("balance", NOW));
  });

  it("no amount: nothing", () => {
    expect(partialPaymentPatch("deposit", 0, 1000, NOW)).toBeNull();
    expect(partialPaymentPatch("deposit", Number.NaN, 1000, NOW)).toBeNull();
  });

  it("unpaid clears the leg", () => {
    expect(unpaidPatch("deposit")).toEqual({ deposit_paid: false, deposit_paid_at: null, deposit_paid_amount: null });
  });
});

describe("photoSelectionStageOf", () => {
  it("the built-in stage, or a custom stage named for choosing photos", () => {
    expect(photoSelectionStageOf([{ key: "client_photo_selection", label: "בחירת תמונות (לאלבום)" }])?.key).toBe("client_photo_selection");
    expect(photoSelectionStageOf([{ key: "custom:1", label: "בחירת תמונות לאלבום" }])?.key).toBe("custom:1");
    expect(photoSelectionStageOf([{ key: "custom:2", label: "עריכת תמונות" }, { key: "gallery_upload", label: "העלאת גלריה" }])).toBeNull();
  });
});

describe("quickReminderBlock", () => {
  const base = { hasPhone: true, openTotal: 500, songStage: { done: false }, songsChosen: false, photoStage: { done: false } };

  it("all three can go when they're open", () => {
    expect(quickReminderBlock("payment", base)).toBeNull();
    expect(quickReminderBlock("songs", base)).toBeNull();
    expect(quickReminderBlock("photos", base)).toBeNull();
  });

  it("no phone blocks every reminder", () => {
    expect(quickReminderBlock("payment", { ...base, hasPhone: false })).toBe("אין טלפון ללקוח");
  });

  it("payment needs money still open", () => {
    expect(quickReminderBlock("payment", { ...base, openTotal: 0 })).toBe("אין יתרה פתוחה");
  });

  it("songs: a stage that isn't done and songs not chosen", () => {
    expect(quickReminderBlock("songs", { ...base, songStage: null })).toBe("אין בחירת שירים בחבילה");
    expect(quickReminderBlock("songs", { ...base, songStage: { done: true } })).toBe("השירים כבר נבחרו");
    expect(quickReminderBlock("songs", { ...base, songsChosen: true })).toBe("השירים כבר נבחרו");
  });

  it("photos: a stage that isn't done", () => {
    expect(quickReminderBlock("photos", { ...base, photoStage: null })).toBe("אין בחירת תמונות בחבילה");
    expect(quickReminderBlock("photos", { ...base, photoStage: { done: true } })).toBe("התמונות כבר נבחרו");
  });
});

describe("quickReminderLogText", () => {
  it("the song reminder reads as a recent ask to the daily song reminder", () => {
    // send-scheduled-messages: n.text.includes(`בנוגע לשלב "${song.label}"`)
    expect(quickReminderLogText("songs", "בחירת שיר לקליפ")).toContain('בנוגע לשלב "בחירת שיר לקליפ"');
  });

  it("the payment reminder carries the mark the dashboard reads", () => {
    expect(quickReminderLogText("payment", null)).toContain("תזכורת תשלום");
  });
});

describe("events layout cookie", () => {
  it("rows unless blocks was chosen", () => {
    expect(parseEventsLayout("grid")).toBe("grid");
    expect(parseEventsLayout("list")).toBe("list");
    expect(parseEventsLayout(undefined)).toBe("list");
    expect(parseEventsLayout("x")).toBe("list");
    expect(eventsLayoutCookie("grid")).toMatch(/^events_view=grid; path=\/;/);
  });
});
