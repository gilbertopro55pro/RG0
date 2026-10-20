import { describe, expect, it } from "vitest";
import { SOURCE_LABELS, SOURCE_LINKS, cleanSource, sourceFromSearch, sourceLabel } from "@/lib/leadSource";

describe("cleanSource", () => {
  it("lower-cases and trims", () => {
    expect(cleanSource("  QR ")).toBe("qr");
    expect(cleanSource("Whatsapp_Ad")).toBe("whatsapp_ad");
  });

  it("maps the common short names", () => {
    expect(cleanSource("ig")).toBe("instagram");
    expect(cleanSource("INSTA")).toBe("instagram");
    expect(cleanSource("fb")).toBe("facebook");
  });

  it("accepts letters, digits, - and _ up to 30 characters", () => {
    expect(cleanSource("spring-2026_promo")).toBe("spring-2026_promo");
    expect(cleanSource("a".repeat(30))).toBe("a".repeat(30));
    expect(cleanSource("a".repeat(31))).toBeNull();
  });

  it("rejects anything else", () => {
    for (const v of ["", "   ", "my source", "פייסבוק", "a.b", "<script>", null, undefined, 5, {}]) expect(cleanSource(v)).toBeNull();
  });
});

describe("sourceFromSearch", () => {
  it("takes ?src= first", () => {
    expect(sourceFromSearch("?src=ad&utm_source=facebook&fbclid=x")).toBe("ad");
    expect(sourceFromSearch("src=IG")).toBe("instagram");
  });

  it("falls back to utm_source when src is missing or invalid", () => {
    expect(sourceFromSearch("?utm_source=fb")).toBe("facebook");
    expect(sourceFromSearch("?src=not%20valid&utm_source=newsletter")).toBe("newsletter");
  });

  it("falls back to the Facebook, then Instagram, click id", () => {
    expect(sourceFromSearch("?fbclid=IwAR123")).toBe("facebook");
    expect(sourceFromSearch("?igshid=abc")).toBe("instagram");
    expect(sourceFromSearch("?fbclid=IwAR123&igshid=abc")).toBe("facebook");
  });

  it("is null with nothing to go by", () => {
    expect(sourceFromSearch("")).toBeNull();
    expect(sourceFromSearch("?utm_campaign=spring")).toBeNull();
    expect(sourceFromSearch("?fbclid=")).toBeNull();
  });
});

describe("sourceLabel", () => {
  it("names a known source in Hebrew, and shows an unknown one as is", () => {
    expect(sourceLabel("ad")).toBe("מודעה");
    expect(sourceLabel("whatsapp_ad")).toBe("מודעת וואטסאפ");
    expect(sourceLabel("newsletter")).toBe("newsletter");
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel("")).toBeNull();
  });

  it("has a label for every link offered in settings, and each link's src is clean", () => {
    for (const { src } of SOURCE_LINKS) {
      expect(SOURCE_LABELS[src]).toBeTruthy();
      expect(cleanSource(src)).toBe(src);
    }
  });
});
