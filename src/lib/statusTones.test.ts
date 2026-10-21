import { describe, expect, it } from "vitest";
import { leadStatusTone, printSendTone, subscriptionStatusTone } from "@/lib/statusTones";

// The vivid look's status tags (owner, 2026-10-21): each status gets the tone of its meaning.
describe("leadStatusTone", () => {
  it("new waits for a first reply, contacted is under way, a sent quote waits, converted is done, lost is out", () => {
    expect(leadStatusTone("new")).toBe("attention");
    expect(leadStatusTone("contacted")).toBe("upcoming");
    expect(leadStatusTone("quoted")).toBe("pending");
    expect(leadStatusTone("won")).toBe("paid");
    expect(leadStatusTone("lost")).toBe("neutral");
  });
});

describe("subscriptionStatusTone", () => {
  it("maps each subscription status to its meaning", () => {
    expect(subscriptionStatusTone("active")).toBe("paid");
    expect(subscriptionStatusTone("trialing")).toBe("upcoming");
    expect(subscriptionStatusTone("past_due")).toBe("attention");
    expect(subscriptionStatusTone("incomplete")).toBe("pending");
    expect(subscriptionStatusTone("canceled")).toBe("neutral");
  });

  it("an unknown status is neutral", () => {
    expect(subscriptionStatusTone("paused")).toBe("neutral");
    expect(subscriptionStatusTone("")).toBe("neutral");
  });
});

describe("printSendTone", () => {
  it("preparing waits, a failure needs the photographer", () => {
    expect(printSendTone({ status: "pending", downloadCount: 0 })).toBe("pending");
    expect(printSendTone({ status: "processing", downloadCount: 0 })).toBe("pending");
    expect(printSendTone({ status: "failed", downloadCount: 0 })).toBe("attention");
    expect(printSendTone({ status: "cancelled", downloadCount: 0 })).toBe("attention");
  });

  it("downloaded by the print house is done, otherwise it's sent", () => {
    expect(printSendTone({ status: "ready", downloadCount: 2 })).toBe("paid");
    expect(printSendTone({ status: "ready", downloadCount: 0 })).toBe("upcoming");
  });

  it("a failure counts even if the link was downloaded before", () => {
    expect(printSendTone({ status: "failed", downloadCount: 1 })).toBe("attention");
  });
});
