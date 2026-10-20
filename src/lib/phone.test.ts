import { describe, expect, it } from "vitest";
import { stripPhoneFormatting } from "@/lib/phone";
import { buildWaMeLink, normalizeIsraeliPhone } from "@/lib/waLink";
import { normalizeIsraeliPhone as normalizeServer } from "@/lib/whatsapp";

const LRI = "⁦";
const PDI = "⁩";
const LRM = "‎";
const RLM = "‏";

describe("stripPhoneFormatting", () => {
  it("removes the isolate marks a phone copied from Contacts carries (the Finbot case)", () => {
    expect(stripPhoneFormatting(`${LRI}+972 50-250-6030${PDI}`)).toBe("+972 50-250-6030");
  });

  it("removes every bidi formatting mark and zero-width character", () => {
    const marks = ["​", "‌", "‍", LRM, RLM, "‪", "‫", "‬", "‭", "‮", LRI, "⁧", "⁨", PDI, "﻿"];
    for (const m of marks) expect(stripPhoneFormatting(`${m}050${m}-123${m}4567${m}`)).toBe("050-1234567");
  });

  it("keeps the number's own characters and inner spaces, and trims the ends", () => {
    expect(stripPhoneFormatting("  +972 (50) 123-4567  ")).toBe("+972 (50) 123-4567");
    expect(stripPhoneFormatting(`${RLM} 050-1234567 ${LRM}`)).toBe("050-1234567");
  });

  it("leaves a clean number unchanged", () => {
    expect(stripPhoneFormatting("0501234567")).toBe("0501234567");
    expect(stripPhoneFormatting("")).toBe("");
  });
});

describe("normalizeIsraeliPhone", () => {
  it("turns a local mobile number into the international form", () => {
    expect(normalizeIsraeliPhone("050-123-4567")).toBe("972501234567");
    expect(normalizeIsraeliPhone("0501234567")).toBe("972501234567");
    expect(normalizeIsraeliPhone("(050) 123 4567")).toBe("972501234567");
  });

  it("turns a local landline into the international form", () => {
    expect(normalizeIsraeliPhone("03-1234567")).toBe("97231234567");
  });

  it("keeps a number already in the international form, without the plus or punctuation", () => {
    expect(normalizeIsraeliPhone("+972 50-123-4567")).toBe("972501234567");
    expect(normalizeIsraeliPhone("972501234567")).toBe("972501234567");
    expect(normalizeIsraeliPhone("+972-3-1234567")).toBe("97231234567");
  });

  it("works on a number with bidi marks once they're stripped", () => {
    expect(normalizeIsraeliPhone(stripPhoneFormatting(`${LRI}+972 50-250-6030${PDI}`))).toBe("972502506030");
    // The marks aren't digits, so they drop out here too.
    expect(normalizeIsraeliPhone(`${LRI}050-250-6030${PDI}`)).toBe("972502506030");
  });

  it("leaves a foreign number's digits as they are", () => {
    expect(normalizeIsraeliPhone("+1 (212) 555-0100")).toBe("12125550100");
    expect(normalizeIsraeliPhone("+7 912 345-67-89")).toBe("79123456789");
  });

  it("is the same on the client (waLink) and the server (whatsapp)", () => {
    for (const p of ["050-123-4567", "+972 50-123-4567", "03-1234567", "+1 212 555 0100", "", "abc"]) {
      expect(normalizeServer(p)).toBe(normalizeIsraeliPhone(p));
    }
  });
});

describe("buildWaMeLink", () => {
  it("opens the client's chat with the text encoded", () => {
    expect(buildWaMeLink("050-123-4567", "שלום דנה,\nקישור: https://myframeflow.com/s/p00000000001?x=1&y=2")).toBe(
      "https://wa.me/972501234567?text=" + encodeURIComponent("שלום דנה,\nקישור: https://myframeflow.com/s/p00000000001?x=1&y=2"),
    );
  });
});
