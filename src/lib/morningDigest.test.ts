import { describe, expect, it } from "vitest";
import { inMorningWindow, israelHour, morningDigest, nextShoot, type DigestEvent } from "@/lib/morningDigest";
import { messagesFor } from "@/i18n/dict";
import { makeT, translate } from "@/i18n/translate";

// The morning notification (owner, 2026-10-26).

const he = (key: string, vars?: Record<string, string | number>) => translate({}, key, vars);
const today = "2026-10-27";
const event = (over: Partial<DigestEvent> = {}): DigestEvent => ({ client_name: "דנה ואורי", event_date: today, event_start_time: "19:00:00", ...over });

describe("the morning window", () => {
  it("08:00 in Israel is 05:00 UTC in summer and 06:00 UTC in winter", () => {
    expect(israelHour(new Date("2026-07-01T05:00:00Z"))).toBe(8);
    expect(israelHour(new Date("2026-12-01T06:00:00Z"))).toBe(8);
  });

  it("sends from 08:00 until 11:00 Israel time, so exactly one of the two runs is in it", () => {
    // Winter: 05:00 UTC is 07:00, 06:00 UTC is 08:00.
    expect(inMorningWindow(new Date("2026-12-01T05:00:00Z"))).toBe(false);
    expect(inMorningWindow(new Date("2026-12-01T06:00:00Z"))).toBe(true);
    // Summer: 05:00 UTC is 08:00 (the 06:00 run is 09:00, still in, and the date column stops it).
    expect(inMorningWindow(new Date("2026-07-01T05:00:00Z"))).toBe(true);
    expect(inMorningWindow(new Date("2026-07-01T08:00:00Z"))).toBe(false); // 11:00
  });
});

describe("nextShoot", () => {
  it("the first open event from today on, by date and time, skipping one already shot", () => {
    const shot = event({ client_name: "צולם", event_stages: [{ stage_key: "shoot_day", done: true }] });
    const closed = event({ client_name: "סגור", closed_at: "2026-10-01" });
    const past = event({ client_name: "עבר", event_date: "2026-10-26" });
    const evening = event({ client_name: "ערב", event_start_time: "19:00:00" });
    const morning = event({ client_name: "בוקר", event_start_time: "09:00:00" });
    expect(nextShoot([evening, shot, closed, past, morning], today)?.client_name).toBe("בוקר");
    expect(nextShoot([shot, closed, past], today)).toBeNull();
  });
});

describe("morningDigest", () => {
  it("nothing on a day with no open task and no shoot today or tomorrow", () => {
    expect(morningDigest({ tasks: [], event: null, today, t: he, locale: "he-IL" })).toBeNull();
    expect(morningDigest({ tasks: [], event: event({ event_date: "2026-10-29" }), today, t: he, locale: "he-IL" })).toBeNull();
  });

  it("the tasks, the first three by name, and the next shoot", () => {
    const tasks = ["להתקשר לדנה", "לשלוח אלבום לדפוס", "לגבות מקדמה", "לערוך קליפ", "לענות ללידים"].map((title) => ({ title, task_date: today }));
    expect(morningDigest({ tasks, event: event(), today, t: he, locale: "he-IL" })).toEqual({
      title: "בוקר טוב! 5 משימות להיום",
      body: "להתקשר לדנה · לשלוח אלבום לדפוס · לגבות מקדמה · ועוד 2\nהצילום הבא: דנה ואורי, היום ב-19:00",
    });
  });

  it("one task; a shoot tomorrow or later is still named", () => {
    const one = [{ title: "להתקשר לדנה", task_date: "2026-10-25" }];
    expect(morningDigest({ tasks: one, event: event({ event_date: "2026-10-28", event_start_time: null }), today, t: he, locale: "he-IL" })).toEqual({
      title: "בוקר טוב! משימה אחת להיום",
      body: "להתקשר לדנה\nהצילום הבא: דנה ואורי, מחר",
    });
    const later = morningDigest({ tasks: one, event: event({ event_date: "2026-11-05" }), today, t: he, locale: "he-IL" });
    expect(later?.body.split("\n")[1]).toMatch(/^הצילום הבא: דנה ואורי, .*5/);
  });

  it("a shoot today with no tasks", () => {
    expect(morningDigest({ tasks: [], event: event(), today, t: he, locale: "he-IL" })).toEqual({
      title: "בוקר טוב! אין משימות פתוחות להיום",
      body: "הצילום הבא: דנה ואורי, היום ב-19:00",
    });
  });

  it("in the photographer's language", () => {
    const t = makeT(messagesFor("en"));
    expect(morningDigest({ tasks: [{ title: "Call Dana", task_date: today }, { title: "Edit clip", task_date: today }], event: event({ client_name: "Dana" }), today, t, locale: "en-US" })).toEqual({
      title: "Good morning! 2 tasks for today",
      body: "Call Dana · Edit clip\nNext shoot: Dana, today at 19:00",
    });
  });
});
