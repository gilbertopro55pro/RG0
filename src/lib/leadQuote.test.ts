import { describe, expect, it } from "vitest";
import {
  EVENING_PACKAGE_HOURS,
  EXTRA_HOUR_PRICE,
  MORNING_PACKAGE_HOURS,
  SLOT_HOURS,
  extraHoursNotice,
  familyPhotosTime,
  packageFromItems,
  slotFor,
  spanMinutes,
} from "@/lib/leadQuote";
import type { PriceQuoteItem } from "@/lib/types";

const items = (...names: string[]): PriceQuoteItem[] => names.map((item) => ({ item, details: "", price: 1000 }));

describe("the owner's default hours", () => {
  it("are 19:00-00:00 for an evening and 09:00-13:00 for a morning", () => {
    expect(SLOT_HOURS.evening).toEqual({ start: "19:00", end: "00:00" });
    expect(SLOT_HOURS.morning).toEqual({ start: "09:00", end: "13:00" });
  });

  it("price an extra hour at 250 ₪, over 5 hours in the evening and 4 in the morning", () => {
    expect(EXTRA_HOUR_PRICE).toBe(250);
    expect(EVENING_PACKAGE_HOURS).toBe(5);
    expect(MORNING_PACKAGE_HOURS).toBe(4);
  });
});

describe("familyPhotosTime", () => {
  it("is always 30 minutes before the start", () => {
    expect(familyPhotosTime("19:00")).toBe("18:30");
    expect(familyPhotosTime("09:00")).toBe("08:30");
    expect(familyPhotosTime("18:15")).toBe("17:45");
  });

  it("accepts a one-digit hour", () => {
    expect(familyPhotosTime("9:00")).toBe("08:30");
  });

  it("wraps back over midnight", () => {
    expect(familyPhotosTime("00:15")).toBe("23:45");
    expect(familyPhotosTime("00:00")).toBe("23:30");
  });

  it("is empty for a time it can't read", () => {
    expect(familyPhotosTime("")).toBe("");
    expect(familyPhotosTime("evening")).toBe("");
    expect(familyPhotosTime("24:00")).toBe("");
    expect(familyPhotosTime("19:60")).toBe("");
  });
});

describe("spanMinutes", () => {
  it("measures a span within the day", () => {
    expect(spanMinutes("09:00", "13:00")).toBe(240);
    expect(spanMinutes("18:00", "23:30")).toBe(330);
  });

  it("reads an end at or before the start as the next day (19:00-00:00 = 5h)", () => {
    expect(spanMinutes("19:00", "00:00")).toBe(300);
    expect(spanMinutes("13:00", "00:30")).toBe(690);
    expect(spanMinutes("20:00", "20:00")).toBe(1440);
  });

  it("is null when either time can't be read", () => {
    expect(spanMinutes("19:00", "")).toBeNull();
    expect(spanMinutes("x", "23:00")).toBeNull();
  });
});

describe("extraHoursNotice", () => {
  it("is nothing for an evening of up to 5 hours", () => {
    expect(extraHoursNotice("evening", "19:00", "00:00")).toBeNull();
    expect(extraHoursNotice("evening", "18:00", "23:00")).toBeNull();
    expect(extraHoursNotice("evening", "20:00", "23:00")).toBeNull();
  });

  it("charges an evening that runs past 5 hours, counting a started hour as a whole one", () => {
    expect(extraHoursNotice("evening", "18:00", "23:30")).toBe(
      "אירוע ערב הוא עד 5 שעות צילום. מעבר לזה יש תשלום נוסף של 250 ₪ לשעה לכל צלם (שעה נוספת)."
    );
    expect(extraHoursNotice("evening", "17:00", "00:00")).toContain("(2 שעות נוספות)");
    expect(extraHoursNotice("evening", "18:00", "00:30")).toContain("(2 שעות נוספות)");
  });

  it("is nothing for a morning of up to 4 hours", () => {
    expect(extraHoursNotice("morning", "09:00", "13:00")).toBeNull();
    expect(extraHoursNotice("morning", "10:00", "12:30")).toBeNull();
  });

  it("explains the 4-hour packages for a longer morning", () => {
    expect(extraHoursNotice("morning", "08:00", "13:00")).toBe(
      "החבילות הן ל-4 שעות צילום. מסגרת ארוכה יותר כרוכה בתשלום נוסף של 250 ₪ לשעה לכל צלם (שעה נוספת)."
    );
    expect(extraHoursNotice("morning", "09:00", "13:01")).toContain("(שעה נוספת)");
    expect(extraHoursNotice("morning", "08:00", "15:00")).toContain("(3 שעות נוספות)");
  });

  it("holds a morning to 4 hours even when the same hours would fit an evening", () => {
    expect(extraHoursNotice("morning", "09:00", "14:00")).not.toBeNull();
    expect(extraHoursNotice("evening", "09:00", "14:00")).toBeNull();
  });

  it("is nothing when the hours can't be read", () => {
    expect(extraHoursNotice("evening", "", "")).toBeNull();
    expect(extraHoursNotice("morning", "09:00", "noon")).toBeNull();
  });
});

describe("slotFor", () => {
  it("takes the assistant's morning or evening as is", () => {
    expect(slotFor("morning")).toBe("morning");
    expect(slotFor("evening", "10:00")).toBe("evening");
  });

  it("prices an afternoon event by the morning's 4-hour package", () => {
    expect(slotFor("afternoon")).toBe("morning");
    expect(slotFor("afternoon", "16:00")).toBe("morning");
  });

  it("otherwise goes by the quote's start hour: before 15:00 is a morning", () => {
    expect(slotFor(null, "14:59")).toBe("morning");
    expect(slotFor(undefined, "09:00")).toBe("morning");
    expect(slotFor(null, "15:00")).toBe("evening");
    expect(slotFor("", "19:00")).toBe("evening");
  });

  it("is an evening when nothing is known", () => {
    expect(slotFor(null)).toBe("evening");
    expect(slotFor(null, "late")).toBe("evening");
    expect(slotFor("night")).toBe("evening");
  });
});

describe("packageFromItems", () => {
  it("is the full flow with an album", () => {
    expect(packageFromItems(items("צילום סטילס", "צילום וידאו", "אלבום דיגיטלי מעוצב"))).toBe("full");
    expect(packageFromItems(items("אלבום"))).toBe("full");
  });

  it("is stills + video with video and no album", () => {
    expect(packageFromItems(items("צילום סטילס", "צלם וידאו"))).toBe("stills_video");
    expect(packageFromItems(items("צלם וידאו", "קליפ היילייטס"))).toBe("stills_video");
  });

  it("is stills + clip with a clip and no video or album", () => {
    expect(packageFromItems(items("צילום סטילס", "קליפ היילייטס"))).toBe("stills_reel");
  });

  it("is stills otherwise", () => {
    expect(packageFromItems(items("צילום סטילס – צלם ראשי", "מגנטים", "רחפן"))).toBe("stills");
    expect(packageFromItems([])).toBe("stills");
  });
});
