import { describe, expect, it } from "vitest";
import { DEFAULT_SLOT_HOURS, blocksSlot, openOnFriday, shabbatClosure, slotHours, slotWindow } from "@/lib/daySlots";

const ev = (start: string | null, end: string | null, arrival: string | null = null) => ({
  arrival_time: arrival,
  event_start_time: start,
  event_end_time: end,
});

// 2026-10-22 is a Thursday, 2026-10-23 a Friday, 2026-10-24 a Saturday.
const THU = "2026-10-22";
const FRI = "2026-10-23";
const SAT = "2026-10-24";

describe("slotHours", () => {
  it("gives the defaults when nothing is stored", () => {
    expect(slotHours(null)).toEqual(DEFAULT_SLOT_HOURS);
    expect(slotHours(undefined)).toEqual(DEFAULT_SLOT_HOURS);
  });

  it("keeps the owner's original hours as the defaults", () => {
    expect(DEFAULT_SLOT_HOURS.morning).toEqual({ start: "07:30", end: "15:00" });
    expect(DEFAULT_SLOT_HOURS.evening).toEqual({ start: "18:00", end: "00:00" });
  });

  it("takes the photographer's hours per part", () => {
    const h = slotHours({ morning: { start: "08:00", end: "13:00" } });
    expect(h.morning).toEqual({ start: "08:00", end: "13:00" });
    expect(h.afternoon).toEqual(DEFAULT_SLOT_HOURS.afternoon);
  });

  it("falls back to the default for a part with an end before its start", () => {
    expect(slotHours({ afternoon: { start: "15:00", end: "10:00" } }).afternoon).toEqual(DEFAULT_SLOT_HOURS.afternoon);
  });

  it("falls back to the default for malformed values", () => {
    expect(slotHours({ evening: { start: "x", end: 5 } }).evening).toEqual(DEFAULT_SLOT_HOURS.evening);
    expect(slotHours({ evening: { start: "9:00", end: "12:00" } }).evening).toEqual(DEFAULT_SLOT_HOURS.evening);
    expect(slotHours("not an object")).toEqual(DEFAULT_SLOT_HOURS);
  });

  it("accepts an end of 00:00 as midnight", () => {
    expect(slotHours({ evening: { start: "19:00", end: "00:00" } }).evening).toEqual({ start: "19:00", end: "00:00" });
    expect(slotWindow({ start: "19:00", end: "00:00" })).toEqual([19 * 60, 24 * 60]);
  });
});

describe("blocksSlot", () => {
  const h = slotHours(null);

  it("blocks only the parts the event's hours overlap", () => {
    const morningEvent = ev("09:00", "11:00");
    expect(blocksSlot(morningEvent, "morning", h)).toBe(true);
    expect(blocksSlot(morningEvent, "afternoon", h)).toBe(false);
    expect(blocksSlot(morningEvent, "evening", h)).toBe(false);
  });

  it("treats an evening event ending at 00:00 as running until midnight", () => {
    const wedding = ev("19:00", "00:00");
    expect(blocksSlot(wedding, "evening", h)).toBe(true);
    expect(blocksSlot(wedding, "afternoon", h)).toBe(false);
  });

  it("blocks the whole day for an event without hours", () => {
    const allDay = ev(null, null);
    expect([blocksSlot(allDay, "morning", h), blocksSlot(allDay, "afternoon", h), blocksSlot(allDay, "evening", h)]).toEqual([true, true, true]);
  });

  it("counts the arrival time as the start", () => {
    expect(blocksSlot(ev("19:00", "23:00", "17:30"), "afternoon", slotHours({ afternoon: { start: "12:00", end: "18:00" } }))).toBe(true);
  });

  it("follows the photographer's own hours", () => {
    const custom = slotHours({ afternoon: { start: "10:00", end: "14:00" }, evening: { start: "20:00", end: "00:00" } });
    expect(blocksSlot(ev("09:00", "11:00"), "afternoon", custom)).toBe(true);
    expect(blocksSlot(ev("16:00", "19:30"), "evening", custom)).toBe(false);
    expect(blocksSlot(ev("16:00", "19:30"), "evening", h)).toBe(true);
  });
});

describe("Shabbat rule", () => {
  const h = slotHours(null);

  it("opens Friday only until 16:00", () => {
    expect(shabbatClosure(FRI, "morning", h)).toBeNull();
    expect(shabbatClosure(FRI, "afternoon", h)).toBeNull();
    expect(shabbatClosure(FRI, "evening", h)).toBe("friday_evening");
    expect(shabbatClosure(FRI, undefined, h)).toBe("friday_evening");
  });

  it("closes a Friday afternoon whose hours end after 16:00", () => {
    const late = slotHours({ afternoon: { start: "13:00", end: "17:00" } });
    expect(openOnFriday("afternoon", late)).toBe(false);
    expect(shabbatClosure(FRI, "afternoon", late)).toBe("friday_evening");
  });

  it("closes Saturday daytime and opens Saturday evening", () => {
    expect(shabbatClosure(SAT, "morning", h)).toBe("saturday");
    expect(shabbatClosure(SAT, "afternoon", h)).toBe("saturday");
    expect(shabbatClosure(SAT, "evening", h)).toBeNull();
  });

  it("leaves other days alone", () => {
    expect(shabbatClosure(THU, "afternoon", h)).toBeNull();
    expect(shabbatClosure(THU, undefined, h)).toBeNull();
  });
});
