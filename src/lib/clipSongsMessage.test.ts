import { describe, expect, it } from "vitest";
import { clipSongsWhatsAppMessage } from "@/lib/clipSongsMessage";
import { makeT } from "@/i18n/translate";
import { messagesFor } from "@/i18n/dict";

// The owner's wording and line breaks (2026-10-26): the songs right under the date, an empty line,
// then the notes on the same line as their title, or "אין הערות".
describe("clipSongsWhatsAppMessage", () => {
  const he = makeT({});
  const base = { photographerName: "רועי גלברט - צילום אירועים 📸", eventName: "יעקב & תמר", eventDate: "25.10.2026", notes: "" };
  const two = { oneSong: false, single: "", calm: "https://youtu.be/a", upbeat: "https://youtu.be/b" };

  it("two songs, no notes: exactly the owner's layout", () => {
    expect(clipSongsWhatsAppMessage({ ...base, songs: two }, he)).toBe(
      [
        "היי רועי גלברט - צילום אירועים 📸,",
        "מצורפים הפרטים לעריכת הקליפ של האירוע:",
        "שם האירוע: יעקב & תמר",
        "תאריך: 25.10.2026",
        "השירים לקליפ:",
        "שיר שקט: https://youtu.be/a",
        "שיר קצבי: https://youtu.be/b",
        "",
        "הערות לקליפ: אין הערות",
      ].join("\n")
    );
  });

  it("the client's notes on the title's line, trimmed", () => {
    const text = clipSongsWhatsAppMessage({ ...base, notes: " שסבתא תופיע בריקוד\nבלי נאומים ", songs: two }, he);
    expect(text.endsWith("\n\nהערות לקליפ: שסבתא תופיע בריקוד\nבלי נאומים")).toBe(true);
  });

  it("one song, in place of the two song lines", () => {
    expect(clipSongsWhatsAppMessage({ ...base, songs: { oneSong: true, single: " Perfect ", calm: "", upbeat: "" } }, he)).toBe(
      "היי רועי גלברט - צילום אירועים 📸,\nמצורפים הפרטים לעריכת הקליפ של האירוע:\nשם האירוע: יעקב & תמר\nתאריך: 25.10.2026\nהשיר: Perfect\n\nהערות לקליפ: אין הערות"
    );
  });

  it("every line on its own line: the WhatsApp link keeps the breaks", () => {
    const text = clipSongsWhatsAppMessage({ ...base, songs: two }, he);
    expect(text.split("\n")).toHaveLength(9);
    expect(encodeURIComponent(text)).toContain("%0A");
  });

  it("no name when the photographer has none", () => {
    const text = clipSongsWhatsAppMessage({ ...base, photographerName: "  ", songs: { oneSong: true, single: "x", calm: "", upbeat: "" } }, he);
    expect(text.startsWith("היי,\n")).toBe(true);
  });

  it("in the portal's language", () => {
    const en = makeT(messagesFor("en"));
    expect(clipSongsWhatsAppMessage({ ...base, photographerName: "Gil", songs: { oneSong: true, single: "x", calm: "", upbeat: "" } }, en)).toBe(
      "Hi Gil,\nHere are the details for editing the event's clip:\nEvent: יעקב & תמר\nDate: 25.10.2026\nSong: x\n\nNotes for the clip: No notes"
    );
  });
});
