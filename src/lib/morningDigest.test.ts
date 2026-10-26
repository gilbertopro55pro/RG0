import { describe, expect, it } from "vitest";
import { DIGEST_TIMES, digestDue, digestTimeLabel, isDigestTime, israelMinutes, morningDigest, nextShoot, type DigestEvent } from "@/lib/morningDigest";
import { messagesFor } from "@/i18n/dict";
import { makeT, translate } from "@/i18n/translate";

// The morning notification (owner, 2026-10-26).

const he = (key: string, vars?: Record<string, string | number>) => translate({}, key, vars);
const today = "2026-10-27";
const event = (over: Partial<DigestEvent> = {}): DigestEvent => ({ client_name: "דנה ואורי", event_date: today, event_start_time: "19:00:00", ...over });

describe("the chosen time", () => {
  it("half hours from 05:00 to 23:00, 08:00 among them", () => {
    expect(DIGEST_TIMES[0]).toBe(300);
    expect(DIGEST_TIMES.at(-1)).toBe(1380);
    expect(DIGEST_TIMES).toHaveLength(37);
    expect(isDigestTime(480)).toBe(true);
    expect(isDigestTime(495)).toBe(false);
    expect(isDigestTime(240)).toBe(false);
    expect(digestTimeLabel(450)).toBe("07:30");
    expect(digestTimeLabel(1380)).toBe("23:00");
  });

  it("Israel time, summer and winter, whatever the server's zone", () => {
    expect(israelMinutes(new Date("2026-07-01T05:00:00Z"))).toBe(8 * 60); // UTC+3
    expect(israelMinutes(new Date("2026-12-01T06:30:00Z"))).toBe(8 * 60 + 30); // UTC+2
    expect(israelMinutes(new Date("2026-12-01T21:00:00Z"))).toBe(23 * 60);
  });

  it("the run at the chosen time sends; a late run up to three hours after still does", () => {
    expect(digestDue(480, 480)).toBe(true);
    expect(digestDue(480, 479)).toBe(true); // a run a moment before the half hour
    expect(digestDue(480, 450)).toBe(false);
    expect(digestDue(480, 600)).toBe(true);
    expect(digestDue(480, 660)).toBe(false);
    // A late-evening time isn't caught by the next day's early runs.
    expect(digestDue(1380, 30)).toBe(false);
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

  it("the greeting follows the time it's sent at", () => {
    const one = [{ title: "להתקשר לדנה", task_date: today }];
    expect(morningDigest({ tasks: one, event: null, today, t: he, locale: "he-IL", minutes: 13 * 60 })?.title).toBe("צהריים טובים! משימה אחת להיום");
    expect(morningDigest({ tasks: one, event: null, today, t: he, locale: "he-IL", minutes: 20 * 60 + 30 })?.title).toBe("ערב טוב! משימה אחת להיום");
  });

  it("in the photographer's language", () => {
    const t = makeT(messagesFor("en"));
    expect(morningDigest({ tasks: [{ title: "Call Dana", task_date: today }, { title: "Edit clip", task_date: today }], event: event({ client_name: "Dana" }), today, t, locale: "en-US" })).toEqual({
      title: "Good morning! 2 tasks for today",
      body: "Call Dana · Edit clip\nNext shoot: Dana, today at 19:00",
    });
  });
});
