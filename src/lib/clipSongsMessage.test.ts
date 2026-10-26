import { describe, expect, it } from "vitest";
import { clipSongsWhatsAppMessage } from "@/lib/clipSongsMessage";
import { makeT } from "@/i18n/translate";
import { messagesFor } from "@/i18n/dict";

describe("clipSongsWhatsAppMessage (owner's wording, 2026-10-26)", () => {
  const he = makeT({});
  const base = { photographerName: "גילברטו", eventName: "דנה ואורי", eventDate: "15.10.2026", notes: "" };

  it("one song", () => {
    expect(
      clipSongsWhatsAppMessage({ ...base, songs: { oneSong: true, single: " Perfect ", calm: "", upbeat: "" } }, he)
    ).toBe("היי גילברטו,\nמצורפים הפרטים לעריכת הקליפ של האירוע:\nשם האירוע: דנה ואורי\nתאריך: 15.10.2026\n\nהשיר: Perfect");
  });

  it("a calm song and an upbeat one, with the clip notes", () => {
    expect(
      clipSongsWhatsAppMessage(
        { ...base, notes: " שסבתא תופיע בריקוד\nבלי נאומים ", songs: { oneSong: false, single: "", calm: "https://youtu.be/a", upbeat: "Happy" } },
        he
      )
    ).toBe(
      "היי גילברטו,\nמצורפים הפרטים לעריכת הקליפ של האירוע:\nשם האירוע: דנה ואורי\nתאריך: 15.10.2026\n\nהשירים לקליפ:\nשיר שקט: https://youtu.be/a\nשיר קיצבי: Happy\n\nהערות לקליפ:\nשסבתא תופיע בריקוד\nבלי נאומים"
    );
  });

  it("no notes section without notes, and no name when the photographer has none", () => {
    const text = clipSongsWhatsAppMessage({ ...base, photographerName: "  ", songs: { oneSong: true, single: "x", calm: "", upbeat: "" } }, he);
    expect(text.startsWith("היי,\n")).toBe(true);
    expect(text).not.toContain("הערות לקליפ");
  });

  it("in the portal's language", () => {
    const en = makeT(messagesFor("en"));
    expect(clipSongsWhatsAppMessage({ ...base, songs: { oneSong: true, single: "x", calm: "", upbeat: "" } }, en)).toBe(
      "Hi גילברטו,\nHere are the details for editing the event's clip:\nEvent: דנה ואורי\nDate: 15.10.2026\n\nSong: x"
    );
  });
});
