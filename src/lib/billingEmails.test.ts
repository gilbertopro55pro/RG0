import { describe, expect, it } from "vitest";
import { planSwitchEmail } from "@/lib/billingEmails";

const base = {
  name: "רודי",
  targetLabel: "פרו+ · חודשי",
  targetAmount: 119,
  targetPricePerMonth: 119,
  wasOnLongCycle: false,
  paymentLink: "https://pay.example/x",
};

describe("planSwitchEmail", () => {
  it("a switch the customer scheduled says they asked for it", () => {
    const email = planSwitchEmail("he", base);
    expect(email.text).toContain("כפי שביקשת, המנוי שלך עובר למסלול פרו+ · חודשי (₪119)");
    expect(email.text).toContain("https://pay.example/x");
  });

  it("an admin price change says the new price and the date to pay by, not 'as you requested'", () => {
    const email = planSwitchEmail("he", { ...base, priceChange: { periodEnd: "2026-12-03T07:18:01Z" } });
    expect(email.text).toContain("המנוי שלך במסלול פרו+ · חודשי יהיה בסך ₪119 לחודש");
    expect(email.text).toContain("עד 3.12.2026");
    expect(email.text).not.toContain("כפי שביקשת");
    expect(email.text).toContain("https://pay.example/x");
  });

  it("uses the Israeli date even when the moment is the previous day in UTC", () => {
    const email = planSwitchEmail("he", { ...base, priceChange: { periodEnd: "2026-12-02T23:30:00Z" } });
    expect(email.text).toContain("עד 3.12.2026");
  });

  it("is translated for English", () => {
    const email = planSwitchEmail("en", { ...base, priceChange: { periodEnd: "2026-12-03T07:18:01Z" } });
    expect(email.text).toContain("Starting next cycle");
    expect(email.text).toContain("₪119 a month");
  });
});
