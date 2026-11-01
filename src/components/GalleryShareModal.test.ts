import { describe, expect, it } from "vitest";
import { buildExportReadyMessage, buildGalleryPhotosUploadedMessage, buildGalleryShareMessage } from "@/components/GalleryShareModal";

// The gallery texts sent to a client, in the fixed client-message shape (owner, 2026-11-01,
// lib/clientMessageFormat.ts): greeting, body, the "קישור:" line, a blank line, the signature.
const url = "https://myframeflow.com/s/gAbc";
const base = { url, clientName: "דנה ואורי", photographerName: "סטודיו אור", photographerEmail: "studio@example.com", expiryDays: null, lang: "he" as const };

describe("buildGalleryShareMessage", () => {
  it("has the fixed shape, signed with the name without a signature", () => {
    expect(buildGalleryShareMessage(base).split("\n")).toEqual([
      "שלום דנה ואורי,",
      "הגלריה מהאירוע שלכם מוכנה לצפייה 📸",
      "אפשר ליהנות מהתמונות, לבחור את האהובות עליכם, להוריד ולשתף.",
      `קישור: ${url}`,
      "",
      "סטודיו אור",
    ]);
  });

  it("signs with the WhatsApp signature, never both, and never adds \"- צילום אירועים\"", () => {
    const msg = buildGalleryShareMessage({ ...base, signature: "רועי גלברט\n050-0000000" });
    expect(msg.endsWith(`קישור: ${url}\n\nרועי גלברט\n050-0000000`)).toBe(true);
    expect(msg).not.toContain("סטודיו אור");
    expect(msg).not.toContain("צילום אירועים");
  });

  it("says how long the gallery is available, before the link line", () => {
    const lines = buildGalleryShareMessage({ ...base, expiryDays: 90 }).split("\n");
    expect(lines[2]).toBe("אפשר ליהנות מהתמונות, לבחור את האהובות עליכם, להוריד ולשתף. הגלריה זמינה למשך 3 חודשים.");
    expect(lines[3]).toBe(`קישור: ${url}`);
  });

  it("greets without a name when there's none", () => {
    expect(buildGalleryShareMessage({ ...base, clientName: "" }).split("\n")[0]).toBe("שלום,");
  });

  it("keeps the owner's own wording in the same shape", () => {
    const lines = buildGalleryShareMessage({ ...base, photographerName: "", photographerEmail: "gilbertopro_admin@gmail.com" }).split("\n");
    expect(lines[0]).toBe("שלום דנה ואורי,");
    expect(lines[1]).toContain("תודה על הזכות לצלם לכם");
    expect(lines[3]).toBe(`קישור: ${url}`);
    expect(lines.at(-1)).toBe("רועי גלברט");
  });

  it("speaks the client's language", () => {
    const lines = buildGalleryShareMessage({ ...base, clientName: "Dana", lang: "en", expiryDays: 7 }).split("\n");
    expect(lines[0]).toBe("Hi Dana,");
    expect(lines[2]).toContain("The gallery is available for 1 week.");
    expect(lines[3]).toBe(`Link: ${url}`);
    const ru = buildGalleryShareMessage({ ...base, clientName: "Анна", lang: "ru" }).split("\n");
    expect(ru[0]).toBe("Здравствуйте, Анна!");
    expect(ru[3]).toBe(`Ссылка: ${url}`);
  });
});

describe("buildGalleryPhotosUploadedMessage", () => {
  it("has the fixed shape", () => {
    expect(buildGalleryPhotosUploadedMessage({ url, clientName: "דנה", count: 12, signature: null, senderName: "סטודיו אור" }).split("\n")).toEqual([
      "שלום דנה,",
      "רצינו לעדכן שנוספו לגלריה שלכם 12 תמונות חדשות 📸",
      `קישור: ${url}`,
      "",
      "סטודיו אור",
    ]);
  });

  it("speaks the client's language", () => {
    expect(buildGalleryPhotosUploadedMessage({ url, clientName: "", count: 3, lang: "en" }).split("\n")).toEqual([
      "Hi,",
      "We wanted to let you know that 3 new photos were added to your gallery 📸",
      `Link: ${url}`,
    ]);
  });
});

describe("buildExportReadyMessage", () => {
  it("names the format, with the link line last", () => {
    expect(buildExportReadyMessage({ label: "ייצוא PDF", url }).split("\n")).toEqual(["שלום,", "האלבום שלכם מוכן להורדה בפורמט PDF.", `קישור: ${url}`]);
  });

  it("speaks of the files when there's no format, and signs when given a name", () => {
    expect(buildExportReadyMessage({ label: "ייצוא הקבצים", url, clientName: "דנה", senderName: "סטודיו אור" }).split("\n")).toEqual([
      "שלום דנה,",
      "קבצי האלבום שלכם מוכנים להורדה.",
      `קישור: ${url}`,
      "",
      "סטודיו אור",
    ]);
  });

  it("speaks the client's language", () => {
    expect(buildExportReadyMessage({ label: "ייצוא JPG", url, lang: "ru" }).split("\n")).toEqual([
      "Здравствуйте!",
      "Ваш альбом готов к скачиванию в формате JPG.",
      `Ссылка: ${url}`,
    ]);
  });
});
