import { describe, it, expect } from "vitest";
import { nextDunningStage, dunningLockDate, type DunningFields } from "@/lib/dunning";
import { renewalPaymentDue, renewalMissed } from "@/lib/subscription";
import { dunningEmail } from "@/lib/billingEmails";

const DAY = 86_400_000;
const END = "2026-10-28T12:00:00.000Z";
const at = (days: number) => new Date(new Date(END).getTime() + days * DAY);

function acct(over: Partial<DunningFields> = {}): DunningFields {
  return {
    subscription_status: "active",
    cancel_at_period_end: false,
    current_period_end: END,
    payplus_recurring_uid: null,
    keep_account: false,
    dunning_for: null,
    dunning_stage: 0,
    ...over,
  };
}

// Runs the daily cron from `fromDay` to `toDay`, applying each stage, and returns [day, stage] pairs.
function simulate(p: DunningFields, fromDay: number, toDay: number, step = 1): [number, number][] {
  const out: [number, number][] = [];
  let row = { ...p };
  for (let d = fromDay; d <= toDay; d += step) {
    const s = nextDunningStage(row, false, at(d));
    if (s) {
      out.push([d, s]);
      row = { ...row, dunning_for: row.current_period_end, dunning_stage: s, subscription_status: s === 4 ? "past_due" : row.subscription_status };
    }
  }
  return out;
}

describe("nextDunningStage", () => {
  it("no recurring: upcoming 3 days before, due on the day, final the day before the lock, lock after 7 days", () => {
    expect(simulate(acct(), -10, 20)).toEqual([[-3, 1], [0, 2], [6, 3], [7, 4]]);
  });

  it("declined recurring: nothing before 2 days late, no upcoming notice", () => {
    expect(simulate(acct({ payplus_recurring_uid: "r" }), -10, 20)).toEqual([[2, 2], [8, 3], [9, 4]]);
  });

  it("a renewal that lands in the grace days ends it before any email", () => {
    expect(nextDunningStage(acct({ payplus_recurring_uid: "r" }), false, at(1.9))).toBeNull();
  });

  it("catching up after missed runs goes one step at a time, so the final warning always comes before the lock", () => {
    expect(simulate(acct(), 10, 13)).toEqual([[10, 2], [11, 3], [12, 4]]);
  });

  it("skips the upcoming notice when the period already ended", () => {
    expect(nextDunningStage(acct(), false, at(0.5))).toBe(2);
  });

  it("a payment (new period end) starts over", () => {
    const paid = acct({ current_period_end: at(30).toISOString(), dunning_for: END, dunning_stage: 4 });
    expect(nextDunningStage(paid, false, at(1))).toBeNull();
    expect(nextDunningStage(paid, false, at(27))).toBe(1);
  });

  it("an admin unlock sticks for that period", () => {
    expect(nextDunningStage(acct({ dunning_for: END, dunning_stage: 4 }), false, at(20))).toBeNull();
  });

  it("leaves alone the admin, keep_account, cancelling, trialing and locked accounts", () => {
    expect(nextDunningStage(acct(), true, at(8))).toBeNull();
    expect(nextDunningStage(acct({ keep_account: true }), false, at(8))).toBeNull();
    expect(nextDunningStage(acct({ cancel_at_period_end: true }), false, at(8))).toBeNull();
    expect(nextDunningStage(acct({ subscription_status: "trialing" }), false, at(8))).toBeNull();
    expect(nextDunningStage(acct({ subscription_status: "past_due" }), false, at(8))).toBeNull();
    expect(nextDunningStage(acct({ current_period_end: null }), false, at(8))).toBeNull();
  });
});

describe("paying again after a declined renewal", () => {
  const p = { subscription_status: "active", cancel_at_period_end: false, current_period_end: END, payplus_recurring_uid: "r" } as const;
  it("opens /billing once the renewal is 2 days late, not before", () => {
    expect(renewalPaymentDue(p, at(1))).toBe(false);
    expect(renewalMissed(p, at(1))).toBe(false);
    expect(renewalPaymentDue(p, at(2))).toBe(true);
    expect(renewalMissed(p, at(2))).toBe(true);
  });
  it("keeps the no-recurring window (3 days before)", () => {
    const n = { ...p, payplus_recurring_uid: null };
    expect(renewalPaymentDue(n, at(-4))).toBe(false);
    expect(renewalPaymentDue(n, at(-3))).toBe(true);
  });
});

describe("dunningEmail", () => {
  const base = { name: "רודי", periodEnd: END, lockDate: dunningLockDate(acct())!, declined: false, siteUrl: "https://myframeflow.com" };
  it("links to /billing and names the lock date in Israel time", () => {
    const e = dunningEmail("he", 2, base);
    expect(e.text).toContain("https://myframeflow.com/billing");
    expect(e.text).toContain("4.11.2026");
    expect(e.subject).toBe("המנוי שלך בגילברטו הסתיים");
  });
  it("says the charge was declined when there's a recurring", () => {
    expect(dunningEmail("he", 2, { ...base, declined: true }).subject).toBe("החיוב החודשי בגילברטו לא עבר");
  });
  it("is translated for every stage", () => {
    for (const stage of [1, 2, 3, 4] as const) {
      for (const lang of ["en", "ru"] as const) {
        const e = dunningEmail(lang, stage, { ...base, name: "Rudy" });
        expect(e.subject).not.toMatch(/[֐-׿]/);
        expect(e.text).not.toMatch(/[֐-׿]/);
      }
    }
  });
});
