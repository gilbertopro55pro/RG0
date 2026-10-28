import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { issueReceipt, FinbotUnreachable, UNREACHABLE_RETRY_DELAYS_MS } from "@/lib/finbot";
import { receiptFailureStatus, RECEIPT_RETRY_WINDOW_MS } from "@/lib/subscriptionReceipt";

function networkError(code: string) {
  return new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });
}
const ok = () => new Response(JSON.stringify({ status: 1, data: "https://finbot/doc/1" }), { status: 200 });
const args = { apiKey: "k", customerName: "לקוח", customerEmail: "a@b.c", amount: 50, description: "מנוי", documentType: "2" };

describe("issueReceipt when Finbot is unreachable", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a connection that never opened, then issues one document", async () => {
    fetchMock.mockRejectedValueOnce(networkError("ECONNREFUSED")).mockRejectedValueOnce(networkError("ENOTFOUND")).mockResolvedValueOnce(ok());
    const p = issueReceipt(args);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ documentLink: "https://finbot/doc/1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reads the code from happy-eyeballs' AggregateError", async () => {
    const agg = new TypeError("fetch failed", { cause: Object.assign(new AggregateError([Object.assign(new Error("x"), { code: "ETIMEDOUT" })]), {}) });
    fetchMock.mockRejectedValueOnce(agg).mockResolvedValueOnce(ok());
    const p = issueReceipt(args);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up with FinbotUnreachable after every delay", async () => {
    fetchMock.mockRejectedValue(networkError("UND_ERR_CONNECT_TIMEOUT"));
    const p = issueReceipt(args);
    const assertion = expect(p).rejects.toBeInstanceOf(FinbotUnreachable);
    await vi.runAllTimersAsync();
    await assertion;
    // One send per delay plus the first, and no extra price fallbacks for a network failure.
    expect(fetchMock).toHaveBeenCalledTimes(UNREACHABLE_RETRY_DELAYS_MS.length + 1);
  });

  it("never resends after the connection broke mid-request (the document may exist)", async () => {
    fetchMock.mockRejectedValue(networkError("ECONNRESET"));
    const p = issueReceipt(args);
    const assertion = expect(p).rejects.toThrow(/לבדוק ב-Finbot/);
    await vi.runAllTimersAsync();
    await assertion;
    await expect(p).rejects.not.toBeInstanceOf(FinbotUnreachable);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a bare 'fetch failed' with no code as possibly sent", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const p = issueReceipt(args);
    const assertion = expect(p).rejects.not.toBeInstanceOf(FinbotUnreachable);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still falls back to the next price on a Finbot rejection", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 0, data: "סכום הפריטים אינו תואם" })))
      .mockResolvedValueOnce(ok());
    await expect(issueReceipt(args)).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("receiptFailureStatus", () => {
  const charged = new Date("2026-10-28T01:31:00Z");
  it("retries an unreachable Finbot inside the window", () => {
    expect(receiptFailureStatus(new FinbotUnreachable("x"), charged, new Date(charged.getTime() + 60_000))).toBe("retry");
  });
  it("hands it to a person after the window", () => {
    expect(receiptFailureStatus(new FinbotUnreachable("x"), charged, new Date(charged.getTime() + RECEIPT_RETRY_WINDOW_MS))).toBe("failed");
  });
  it("never retries any other failure", () => {
    expect(receiptFailureStatus(new Error("rejected"), charged, charged)).toBe("failed");
  });
});
